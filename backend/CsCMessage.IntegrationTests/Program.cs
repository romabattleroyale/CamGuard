using System.Security.Cryptography;
using System.Text;
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
    var ceremonyOptions = $"""{"challenge":"{{Convert.ToBase64String(ceremonyChallenge)}}","rpId":"localhost"}""";
    var ceremonyStore = new WebAuthnCeremonyStore(dataSource);
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

    var expiredChallenge = RandomNumberGenerator.GetBytes(32);
    var expiredCeremonyId = await ceremonyStore.CreateAsync(
        accountId, WebAuthnCeremonyPurpose.Authentication, expiredChallenge, ceremonyOptions);
    await using (var expire = await dataSource.OpenConnectionAsync())
    await using (var command = new NpgsqlCommand(
        "UPDATE webauthn_challenges SET expires_at = NOW() - INTERVAL '1 second' WHERE id = @id", expire))
    {
        command.Parameters.AddWithValue("id", expiredCeremonyId);
        await command.ExecuteNonQueryAsync();
    }

    if (await ceremonyStore.ConsumeAsync(expiredChallenge) is not null)
        throw new Exception("An expired WebAuthn challenge was accepted.");

    await ceremonyStore.DeleteExpiredAsync();

    Console.WriteLine("PASS: refresh-token lifecycle and WebAuthn ceremony persistence, expiry and single-use consumption.");
}
finally
{
    await using var cleanup = await dataSource.OpenConnectionAsync();
    await using var command = new NpgsqlCommand("DELETE FROM accounts WHERE id = @account", cleanup);
    command.Parameters.AddWithValue("account", accountId);
    await command.ExecuteNonQueryAsync();
}
