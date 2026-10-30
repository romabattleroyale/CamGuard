using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CsCMessage.Api.Security;
using Npgsql;
using NpgsqlTypes;

var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__CsCMessage");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("ConnectionStrings__CsCMessage is required for integration tests.");

await using var dataSource = NpgsqlDataSource.Create(connectionString);
var accountId = Guid.NewGuid();
var deviceId = Guid.NewGuid();

await using (var seed = await dataSource.OpenConnectionAsync())
await using (var command = new NpgsqlCommand("""
    INSERT INTO accounts (id) VALUES (@account);
    INSERT INTO devices (id, account_id, platform, identity_public_key, identity_key_fingerprint)
    VALUES (@device, @account, 'web', @public_key, @fingerprint);
    """, seed))
{
    command.Parameters.AddWithValue("account", accountId);
    command.Parameters.AddWithValue("device", deviceId);
    command.Parameters.AddWithValue("public_key", NpgsqlDbType.Bytea, RandomNumberGenerator.GetBytes(32));
    command.Parameters.AddWithValue("fingerprint", NpgsqlDbType.Bytea, RandomNumberGenerator.GetBytes(32));
    await command.ExecuteNonQueryAsync();
}

try
{
    var store = new RefreshSessionStore(dataSource);
    var first = await store.CreateAsync(accountId, deviceId)
        ?? throw new Exception("A session was not created for an active device.");

    if (first.RefreshToken.Length != 43)
        throw new Exception("Refresh token does not have the expected 256-bit base64url representation.");

    await using (var verifyHash = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand(
        "SELECT refresh_token_hash FROM device_sessions WHERE id = @id", verifyHash))
    {
        command.Parameters.AddWithValue("id", first.SessionId);
        var stored = (byte[]?)await command.ExecuteScalarAsync()
            ?? throw new Exception("Refresh token hash was not persisted.");
        var expected = SHA256.HashData(Encoding.ASCII.GetBytes(first.RefreshToken));
        if (!CryptographicOperations.FixedTimeEquals(stored, expected))
            throw new Exception("Database does not contain the SHA-256 digest of the issued token.");
    }

    var rotated = await store.RotateAsync(first.RefreshToken);
    if (rotated.Status != RefreshRotationStatus.Rotated || rotated.Session is null)
        throw new Exception($"Expected successful rotation, received {rotated.Status}.");

    var replay = await store.RotateAsync(first.RefreshToken);
    if (replay.Status != RefreshRotationStatus.ReuseDetected)
        throw new Exception($"Expected replay detection, received {replay.Status}.");

    await using (var verifyFamily = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand("""
        SELECT count(*) FROM device_sessions
        WHERE account_id = @account AND revoked_at IS NOT NULL
        """, verifyFamily))
    {
        command.Parameters.AddWithValue("account", accountId);
        var revoked = Convert.ToInt64(await command.ExecuteScalarAsync());
        if (revoked != 2)
            throw new Exception($"Expected both sessions in the token family to be revoked, found {revoked}.");
    }

    var concurrentBase = await store.CreateAsync(accountId, deviceId)
        ?? throw new Exception("Could not create a session for the concurrency test.");

    var concurrentResults = await Task.WhenAll(
        store.RotateAsync(concurrentBase.RefreshToken),
        store.RotateAsync(concurrentBase.RefreshToken));

    if (concurrentResults.Count(result => result.Status == RefreshRotationStatus.Rotated) != 1 ||
        concurrentResults.Count(result => result.Status == RefreshRotationStatus.ReuseDetected) != 1)
        throw new Exception("Concurrent refresh attempts did not produce exactly one rotation and one replay detection.");

    await using (var verifyConcurrentFamily = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand("""
        SELECT count(*) FROM device_sessions
        WHERE token_family_id = (
            SELECT token_family_id FROM device_sessions WHERE id = @session
        ) AND revoked_at IS NOT NULL
        """, verifyConcurrentFamily))
    {
        command.Parameters.AddWithValue("session", concurrentBase.SessionId);
        var revoked = Convert.ToInt64(await command.ExecuteScalarAsync());
        if (revoked != 2)
            throw new Exception($"Concurrent replay did not revoke both family sessions; found {revoked}.");
    }

    var invalidEncoding = await store.RotateAsync("é" + concurrentBase.RefreshToken[1..]);
    if (invalidEncoding.Status != RefreshRotationStatus.Invalid)
        throw new Exception("Non-ASCII refresh token input was not rejected.");

    var ceremonyChallenge = RandomNumberGenerator.GetBytes(32);
    var ceremonyOptions = JsonSerializer.Serialize(new { challenge = Convert.ToBase64String(ceremonyChallenge), rpId = "localhost" });
    var ceremonyStore = new WebAuthnCeremonyStore(dataSource);

    await AssertThrowsAsync<ArgumentException>(
        () => ceremonyStore.CreateAsync(accountId, WebAuthnCeremonyPurpose.FirstAccountEnrollment,
            RandomNumberGenerator.GetBytes(32), ceremonyOptions),
        "First-account enrollment accepted an existing account binding.");
    await AssertThrowsAsync<ArgumentException>(
        () => ceremonyStore.CreateAsync(null, WebAuthnCeremonyPurpose.Registration,
            RandomNumberGenerator.GetBytes(32), ceremonyOptions),
        "Account registration accepted a missing account binding.");
    await AssertThrowsAsync<ArgumentException>(
        () => ceremonyStore.CreateAsync(null, WebAuthnCeremonyPurpose.Authentication,
            RandomNumberGenerator.GetBytes(32), ceremonyOptions),
        "Authentication accepted a missing account binding.");

    // Repeat the scope checks at the database boundary: bypassing the C# store
    // must not allow an anonymous bootstrap ceremony to claim an existing account,
    // nor an account-bound flow to omit its owner.
    await AssertCheckViolationAsync(async () =>
    {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand("""
            INSERT INTO webauthn_challenges
                (id, account_id, purpose, challenge_hash, ceremony_options, created_at, expires_at)
            VALUES
                (@id, @account, 'first_enrollment', @hash, '{}'::jsonb, NOW(), NOW() + INTERVAL '5 minutes')
            """, connection);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("account", accountId);
        command.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, RandomNumberGenerator.GetBytes(32));
        await command.ExecuteNonQueryAsync();
    }, "Database accepted a first-enrollment challenge bound to an existing account.");

    await AssertCheckViolationAsync(async () =>
    {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand("""
            INSERT INTO webauthn_challenges
                (id, account_id, purpose, challenge_hash, ceremony_options, created_at, expires_at)
            VALUES
                (@id, NULL, 'registration', @hash, '{}'::jsonb, NOW(), NOW() + INTERVAL '5 minutes')
            """, connection);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, RandomNumberGenerator.GetBytes(32));
        await command.ExecuteNonQueryAsync();
    }, "Database accepted a registration challenge without an account owner.");

    var ceremonyId = await ceremonyStore.CreateAsync(
        accountId, WebAuthnCeremonyPurpose.Registration, ceremonyChallenge, ceremonyOptions);

    var consumedCeremony = await ceremonyStore.ConsumeAsync(ceremonyChallenge);
    if (consumedCeremony is null ||
        consumedCeremony.Id != ceremonyId ||
        consumedCeremony.AccountId != accountId ||
        consumedCeremony.Purpose != WebAuthnCeremonyPurpose.Registration ||
        !consumedCeremony.OptionsJson.Contains(Convert.ToBase64String(ceremonyChallenge), StringComparison.Ordinal))
        throw new Exception("WebAuthn ceremony state was not persisted and returned correctly.");

    if (await ceremonyStore.ConsumeAsync(ceremonyChallenge) is not null)
        throw new Exception("A WebAuthn challenge was accepted more than once.");

    var firstEnrollmentChallenge = RandomNumberGenerator.GetBytes(32);
    var firstEnrollmentOptions = JsonSerializer.Serialize(new { challenge = Convert.ToBase64String(firstEnrollmentChallenge), rpId = "localhost" });
    var firstEnrollmentId = await ceremonyStore.CreateAsync(
        null, WebAuthnCeremonyPurpose.FirstAccountEnrollment, firstEnrollmentChallenge, firstEnrollmentOptions);
    var pendingFirstEnrollment = await ceremonyStore.GetPendingAsync(
        firstEnrollmentId, WebAuthnCeremonyPurpose.FirstAccountEnrollment, null);
    if (pendingFirstEnrollment is null ||
        pendingFirstEnrollment.Id != firstEnrollmentId ||
        pendingFirstEnrollment.AccountId is not null ||
        pendingFirstEnrollment.Purpose != WebAuthnCeremonyPurpose.FirstAccountEnrollment ||
        !pendingFirstEnrollment.OptionsJson.Contains(Convert.ToBase64String(firstEnrollmentChallenge), StringComparison.Ordinal))
        throw new Exception("Pending first-enrollment options could not be retrieved by their scoped ceremony ID.");
    if (await ceremonyStore.GetPendingAsync(
        firstEnrollmentId, WebAuthnCeremonyPurpose.FirstAccountEnrollment, accountId) is not null)
        throw new Exception("A first-enrollment ceremony was returned for the wrong account scope.");

    var concurrentConsumption = await Task.WhenAll(
        ceremonyStore.ConsumeAsync(firstEnrollmentChallenge),
        ceremonyStore.ConsumeAsync(firstEnrollmentChallenge));
    if (concurrentConsumption.Count(item => item is not null) != 1 ||
        concurrentConsumption.Single(item => item is not null) is not { } firstEnrollment ||
        firstEnrollment.Id != firstEnrollmentId ||
        firstEnrollment.AccountId is not null ||
        firstEnrollment.Purpose != WebAuthnCeremonyPurpose.FirstAccountEnrollment)
        throw new Exception("First-account enrollment ceremony was not purpose-bound and single-use under concurrent completion.");

    var rollbackChallenge = RandomNumberGenerator.GetBytes(32);
    var rollbackOptions = JsonSerializer.Serialize(new { challenge = Convert.ToBase64String(rollbackChallenge), rpId = "localhost" });
    var rollbackCeremonyId = await ceremonyStore.CreateAsync(
        null, WebAuthnCeremonyPurpose.FirstAccountEnrollment, rollbackChallenge, rollbackOptions);
    var rollbackAccountId = Guid.NewGuid();
    await using (var rollbackConnection = await dataSource.OpenConnectionAsync())
    await using (var transaction = await rollbackConnection.BeginTransactionAsync())
    {
        var consumedInTransaction = await ceremonyStore.ConsumeAsync(
            rollbackCeremonyId,
            WebAuthnCeremonyPurpose.FirstAccountEnrollment,
            null,
            rollbackConnection,
            transaction);
        if (consumedInTransaction?.Purpose != WebAuthnCeremonyPurpose.FirstAccountEnrollment)
            throw new Exception("The enrollment challenge was not consumed inside the caller transaction.");

        await using var insertAccount = new NpgsqlCommand(
            "INSERT INTO accounts (id) VALUES (@account)", rollbackConnection, transaction);
        insertAccount.Parameters.AddWithValue("account", rollbackAccountId);
        await insertAccount.ExecuteNonQueryAsync();
        await transaction.RollbackAsync();
    }

    await using (var verifyRollback = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand(
        "SELECT count(*) FROM accounts WHERE id = @account", verifyRollback))
    {
        command.Parameters.AddWithValue("account", rollbackAccountId);
        if (Convert.ToInt64(await command.ExecuteScalarAsync()) != 0)
            throw new Exception("A partially-created account survived enrollment rollback.");
    }

    if (await ceremonyStore.ConsumeAsync(rollbackChallenge) is null)
        throw new Exception("Challenge consumption was not rolled back with the failed account transaction.");

    var expiredChallenge = RandomNumberGenerator.GetBytes(32);
    var expiredCeremonyId = await ceremonyStore.CreateAsync(
        accountId, WebAuthnCeremonyPurpose.Authentication, expiredChallenge, ceremonyOptions);
    await using (var expire = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand(
        "UPDATE webauthn_challenges SET created_at = NOW() - INTERVAL '2 seconds', expires_at = NOW() - INTERVAL '1 second' WHERE id = @id", expire))
    {
        command.Parameters.AddWithValue("id", expiredCeremonyId);
        await command.ExecuteNonQueryAsync();
    }

    if (await ceremonyStore.ConsumeAsync(expiredChallenge) is not null)
        throw new Exception("An expired WebAuthn challenge was accepted.");

    await ceremonyStore.DeleteExpiredAsync();

    var passkeyStore = new PasskeyCredentialStore(dataSource);
    var credentialId = RandomNumberGenerator.GetBytes(32);
    var publicKey = RandomNumberGenerator.GetBytes(65);
    var userHandle = RandomNumberGenerator.GetBytes(32);
    var aaGuid = Guid.NewGuid();

    if (!await passkeyStore.AddAsync(
        accountId, credentialId, publicKey, userHandle, 3,
        ["internal", "hybrid"], aaGuid, "  Telefono principale  "))
        throw new Exception("A new public passkey credential was not stored.");

    if (await passkeyStore.AddAsync(
        accountId, credentialId, publicKey, userHandle, 3,
        ["internal"], aaGuid, "Duplicato"))
        throw new Exception("A duplicate WebAuthn credential ID was accepted.");

    var storedPasskey = await passkeyStore.GetByCredentialIdAsync(credentialId);
    if (storedPasskey is null ||
        storedPasskey.AccountId != accountId ||
        !storedPasskey.PublicKey.SequenceEqual(publicKey) ||
        !storedPasskey.UserHandle.SequenceEqual(userHandle) ||
        storedPasskey.SignatureCounter != 3 ||
        storedPasskey.DisplayName != "Telefono principale" ||
        storedPasskey.AaGuid != aaGuid ||
        !storedPasskey.Transports.SequenceEqual(["internal", "hybrid"]))
        throw new Exception("Stored public passkey material did not round-trip correctly.");

    var byHandle = await passkeyStore.GetByUserHandleAsync(userHandle);
    if (byHandle.Count != 1 || !byHandle[0].CredentialId.SequenceEqual(credentialId))
        throw new Exception("Passkey lookup by user handle did not return the owning credential.");

    if (!await passkeyStore.TryUpdateCounterAsync(credentialId, 3, 4))
        throw new Exception("Passkey signature counter did not advance.");
    if (await passkeyStore.TryUpdateCounterAsync(credentialId, 3, 5))
        throw new Exception("A stale concurrent passkey counter update was accepted.");
    if (await passkeyStore.TryUpdateCounterAsync(credentialId, 4, 2))
        throw new Exception("A decreasing passkey signature counter was accepted.");
    if (await passkeyStore.TryUpdateCounterAsync(credentialId, 4, 0))
        throw new Exception("A previously advancing passkey counter was allowed to reset to zero.");

    var updatedPasskey = await passkeyStore.GetByCredentialIdAsync(credentialId);
    if (updatedPasskey?.SignatureCounter != 4 || updatedPasskey.LastUsedAt is null)
        throw new Exception("Passkey counter update did not persist atomically.");

    if (await passkeyStore.RevokeAsync(Guid.NewGuid(), credentialId))
        throw new Exception("A different account was able to revoke this passkey.");
    if (!await passkeyStore.RevokeAsync(accountId, credentialId))
        throw new Exception("The owning account could not revoke its passkey.");
    if (await passkeyStore.GetByCredentialIdAsync(credentialId) is not null ||
        (await passkeyStore.GetByUserHandleAsync(userHandle)).Count != 0)
        throw new Exception("A revoked passkey remained available for authentication.");

    Console.WriteLine("PASS: refresh-token lifecycle, WebAuthn ceremony state and public passkey credential persistence/revocation.");
}
finally
{
    await using var cleanup = await dataSource.OpenConnectionAsync();
    await using var command = new NpgsqlCommand("DELETE FROM accounts WHERE id = @account", cleanup);
    command.Parameters.AddWithValue("account", accountId);
    await command.ExecuteNonQueryAsync();
}

static async Task AssertThrowsAsync<TException>(Func<Task> action, string failureMessage)
    where TException : Exception
{
    try
    {
        await action();
    }
    catch (TException)
    {
        return;
    }

    throw new Exception(failureMessage);
}

static async Task AssertCheckViolationAsync(Func<Task> action, string failureMessage)
{
    try
    {
        await action();
    }
    catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.CheckViolation)
    {
        return;
    }

    throw new Exception(failureMessage);
}
