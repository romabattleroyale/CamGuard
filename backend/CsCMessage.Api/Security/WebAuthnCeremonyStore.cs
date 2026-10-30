using System.Security.Cryptography;
using Npgsql;
using NpgsqlTypes;

namespace CsCMessage.Api.Security;

public enum WebAuthnCeremonyPurpose
{
    FirstAccountEnrollment,
    Registration,
    Authentication
}

public sealed record StoredWebAuthnCeremony(
    Guid Id,
    Guid? AccountId,
    WebAuthnCeremonyPurpose Purpose,
    string OptionsJson);

/// <summary>
/// Stores short-lived WebAuthn ceremony state. The challenge is indexed by
/// SHA-256 digest; serialized options are retained briefly because the FIDO2
/// relying-party library needs the original challenge when validating a response.
/// </summary>
public sealed class WebAuthnCeremonyStore(NpgsqlDataSource dataSource)
{
    private static readonly TimeSpan MaximumLifetime = TimeSpan.FromMinutes(5);
    private const int MaximumOptionsLength = 32 * 1024;

    public async Task<Guid> CreateAsync(
        Guid? accountId,
        WebAuthnCeremonyPurpose purpose,
        byte[] challenge,
        string optionsJson,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Length is < 16 or > 1024)
            throw new ArgumentOutOfRangeException(nameof(challenge));
        if (string.IsNullOrWhiteSpace(optionsJson) || optionsJson.Length > MaximumOptionsLength)
            throw new ArgumentOutOfRangeException(nameof(optionsJson));

        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var expires = now.Add(MaximumLifetime);
        var purposeValue = purpose switch
        {
            WebAuthnCeremonyPurpose.FirstAccountEnrollment => "first_enrollment",
            WebAuthnCeremonyPurpose.Registration => "registration",
            WebAuthnCeremonyPurpose.Authentication => "authentication",
            _ => throw new ArgumentOutOfRangeException(nameof(purpose))
        };

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            INSERT INTO webauthn_challenges
                (id, account_id, purpose, challenge_hash, ceremony_options, created_at, expires_at)
            VALUES (@id, @account, @purpose, @hash, CAST(@options AS jsonb), @created, @expires)
            """, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("account", (object?)accountId ?? DBNull.Value);
        command.Parameters.AddWithValue("purpose", purposeValue);
        command.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, SHA256.HashData(challenge));
        command.Parameters.AddWithValue("options", optionsJson);
        command.Parameters.AddWithValue("created", now);
        command.Parameters.AddWithValue("expires", expires);
        await command.ExecuteNonQueryAsync(cancellationToken);
        return id;
    }

    public async Task<StoredWebAuthnCeremony?> ConsumeAsync(
        byte[] challenge,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Length is < 16 or > 1024)
            return null;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            UPDATE webauthn_challenges
            SET consumed_at = NOW()
            WHERE challenge_hash = @hash
              AND consumed_at IS NULL
              AND expires_at > NOW()
            RETURNING id, account_id, purpose, ceremony_options::text
            """, connection);
        command.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, SHA256.HashData(challenge));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        var purpose = reader.GetString(2) switch
        {
            "first_enrollment" => WebAuthnCeremonyPurpose.FirstAccountEnrollment,
            "registration" => WebAuthnCeremonyPurpose.Registration,
            "authentication" => WebAuthnCeremonyPurpose.Authentication,
            _ => throw new InvalidOperationException("Unknown WebAuthn ceremony purpose in storage.")
        };

        return new StoredWebAuthnCeremony(
            reader.GetGuid(0),
            reader.IsDBNull(1) ? null : reader.GetGuid(1),
            purpose,
            reader.GetString(3));
    }

    public async Task<int> DeleteExpiredAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            DELETE FROM webauthn_challenges
            WHERE expires_at <= NOW()
            """, connection);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
