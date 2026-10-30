using Npgsql;
using NpgsqlTypes;

namespace CsCMessage.Api.Security;

public sealed record StoredPasskeyCredential(
    Guid Id,
    Guid AccountId,
    byte[] CredentialId,
    byte[] PublicKey,
    byte[] UserHandle,
    long SignatureCounter,
    IReadOnlyList<string> Transports,
    Guid? AaGuid,
    string DisplayName,
    DateTime CreatedAt,
    DateTime? LastUsedAt);

/// <summary>
/// Persists only public WebAuthn credential material. All credential verification
/// remains the responsibility of the FIDO2 relying-party library.
/// </summary>
public sealed class PasskeyCredentialStore(NpgsqlDataSource dataSource)
{
    private static readonly HashSet<string> AllowedTransports =
        new(StringComparer.Ordinal) { "usb", "nfc", "ble", "internal", "hybrid", "smart-card" };

    public async Task<bool> AddAsync(
        Guid accountId,
        byte[] credentialId,
        byte[] publicKey,
        byte[] userHandle,
        uint signatureCounter,
        IReadOnlyCollection<string>? transports,
        Guid? aaGuid,
        string displayName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credentialId);
        ArgumentNullException.ThrowIfNull(publicKey);
        ArgumentNullException.ThrowIfNull(userHandle);
        ArgumentException.ThrowIfNullOrWhiteSpace(displayName);

        if (credentialId.Length is < 1 or > 1024)
            throw new ArgumentOutOfRangeException(nameof(credentialId));
        if (publicKey.Length is < 1 or > 4096)
            throw new ArgumentOutOfRangeException(nameof(publicKey));
        if (userHandle.Length is < 1 or > 64)
            throw new ArgumentOutOfRangeException(nameof(userHandle));

        var label = displayName.Trim();
        if (label.Length is < 1 or > 64)
            throw new ArgumentOutOfRangeException(nameof(displayName));

        var normalizedTransports = (transports ?? Array.Empty<string>())
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (normalizedTransports.Any(value => !AllowedTransports.Contains(value)))
            throw new ArgumentException("A WebAuthn transport value is not supported.", nameof(transports));

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            INSERT INTO passkey_credentials
                (id, account_id, credential_id, public_key, user_handle,
                 signature_counter, transports, aaguid, display_name)
            VALUES
                (@id, @account, @credential, @public_key, @user_handle,
                 @counter, @transports, @aaguid, @display_name)
            ON CONFLICT DO NOTHING
            """, connection);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("account", accountId);
        command.Parameters.AddWithValue("credential", NpgsqlDbType.Bytea, credentialId);
        command.Parameters.AddWithValue("public_key", NpgsqlDbType.Bytea, publicKey);
        command.Parameters.AddWithValue("user_handle", NpgsqlDbType.Bytea, userHandle);
        command.Parameters.AddWithValue("counter", (long)signatureCounter);
        command.Parameters.AddWithValue("transports", NpgsqlDbType.Array | NpgsqlDbType.Text, normalizedTransports);
        command.Parameters.AddWithValue("aaguid", (object?)aaGuid ?? DBNull.Value);
        command.Parameters.AddWithValue("display_name", label);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<StoredPasskeyCredential?> GetByCredentialIdAsync(
        byte[] credentialId,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credentialId);
        if (credentialId.Length is < 1 or > 1024)
            return null;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            SELECT id, account_id, credential_id, public_key, user_handle,
                   signature_counter, transports, aaguid, display_name, created_at, last_used_at
            FROM passkey_credentials
            WHERE credential_id = @credential AND revoked_at IS NULL
            """, connection);
        command.Parameters.AddWithValue("credential", NpgsqlDbType.Bytea, credentialId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadCredential(reader) : null;
    }

    public async Task<IReadOnlyList<StoredPasskeyCredential>> GetByUserHandleAsync(
        byte[] userHandle,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(userHandle);
        if (userHandle.Length is < 1 or > 64)
            return Array.Empty<StoredPasskeyCredential>();

        var credentials = new List<StoredPasskeyCredential>();
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            SELECT id, account_id, credential_id, public_key, user_handle,
                   signature_counter, transports, aaguid, display_name, created_at, last_used_at
            FROM passkey_credentials
            WHERE user_handle = @handle AND revoked_at IS NULL
            ORDER BY created_at
            """, connection);
        command.Parameters.AddWithValue("handle", NpgsqlDbType.Bytea, userHandle);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            credentials.Add(ReadCredential(reader));
        return credentials;
    }

    /// <summary>
    /// Compare-and-swap counter update prevents concurrent assertions from
    /// overwriting one another. A zero counter is permitted for authenticators
    /// that do not implement signature counters.
    /// </summary>
    public async Task<bool> TryUpdateCounterAsync(
        byte[] credentialId,
        uint expectedCounter,
        uint newCounter,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credentialId);
        if (credentialId.Length is < 1 or > 1024)
            return false;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            UPDATE passkey_credentials
            SET signature_counter = @next, last_used_at = NOW()
            WHERE credential_id = @credential
              AND revoked_at IS NULL
              AND signature_counter = @expected
              AND (@next = 0 OR @next > signature_counter)
            """, connection);
        command.Parameters.AddWithValue("credential", NpgsqlDbType.Bytea, credentialId);
        command.Parameters.AddWithValue("expected", (long)expectedCounter);
        command.Parameters.AddWithValue("next", (long)newCounter);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<bool> RevokeAsync(
        Guid accountId,
        byte[] credentialId,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credentialId);
        if (credentialId.Length is < 1 or > 1024)
            return false;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            UPDATE passkey_credentials
            SET revoked_at = NOW()
            WHERE account_id = @account
              AND credential_id = @credential
              AND revoked_at IS NULL
            """, connection);
        command.Parameters.AddWithValue("account", accountId);
        command.Parameters.AddWithValue("credential", NpgsqlDbType.Bytea, credentialId);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    private static StoredPasskeyCredential ReadCredential(NpgsqlDataReader reader) =>
        new(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetFieldValue<byte[]>(2),
            reader.GetFieldValue<byte[]>(3),
            reader.GetFieldValue<byte[]>(4),
            reader.GetInt64(5),
            reader.GetFieldValue<string[]>(6),
            reader.IsDBNull(7) ? null : reader.GetGuid(7),
            reader.GetString(8),
            reader.GetDateTime(9),
            reader.IsDBNull(10) ? null : reader.GetDateTime(10));
}
