using System.Security.Cryptography;
using System.Text;
using Npgsql;
using NpgsqlTypes;

namespace CsCMessage.Api.Security;

public enum RefreshRotationStatus
{
    Rotated,
    Invalid,
    Expired,
    ReuseDetected,
    DeviceRevoked
}

public sealed record IssuedRefreshSession(Guid SessionId, string RefreshToken, DateTime ExpiresAtUtc);
public sealed record RefreshRotationResult(RefreshRotationStatus Status, IssuedRefreshSession? Session = null);

/// <summary>
/// Persists only SHA-256 digests of high-entropy refresh tokens.
/// Callers must authenticate the account/device before creating a session.
/// </summary>
public sealed class RefreshSessionStore(NpgsqlDataSource dataSource)
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromDays(30);

    public async Task<IssuedRefreshSession?> CreateAsync(
        Guid accountId, Guid deviceId, CancellationToken cancellationToken = default)
    {
        var token = CreateOpaqueToken();
        var sessionId = Guid.NewGuid();
        var familyId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var expires = now.Add(TokenLifetime);

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            INSERT INTO device_sessions
                (id, account_id, device_id, token_family_id, refresh_token_hash, issued_at, expires_at)
            SELECT @id, d.account_id, d.id, @family, @hash, @issued, @expires
            FROM devices d
            WHERE d.id = @device AND d.account_id = @account AND d.revoked_at IS NULL
            """, connection);
        command.Parameters.AddWithValue("id", sessionId);
        command.Parameters.AddWithValue("family", familyId);
        command.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, HashToken(token));
        command.Parameters.AddWithValue("issued", now);
        command.Parameters.AddWithValue("expires", expires);
        command.Parameters.AddWithValue("device", deviceId);
        command.Parameters.AddWithValue("account", accountId);

        return await command.ExecuteNonQueryAsync(cancellationToken) == 1
            ? new IssuedRefreshSession(sessionId, token, expires)
            : null;
    }

    public async Task<RefreshRotationResult> RotateAsync(
        string presentedToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(presentedToken) || presentedToken.Length > 256)
            return new RefreshRotationResult(RefreshRotationStatus.Invalid);

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, cancellationToken);

        Guid oldId;
        Guid accountId;
        Guid deviceId;
        Guid familyId;
        DateTime expiresAt;
        DateTime? consumedAt;
        DateTime? revokedAt;
        bool deviceIsRevoked;

        await using (var read = new NpgsqlCommand("""
            SELECT s.id, s.account_id, s.device_id, s.token_family_id,
                   s.expires_at, s.consumed_at, s.revoked_at, (d.revoked_at IS NOT NULL)
            FROM device_sessions s
            JOIN devices d ON d.id = s.device_id AND d.account_id = s.account_id
            WHERE s.refresh_token_hash = @hash
            FOR UPDATE OF s
            """, connection, transaction))
        {
            read.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, HashToken(presentedToken));
            await using var reader = await read.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await transaction.RollbackAsync(cancellationToken);
                return new RefreshRotationResult(RefreshRotationStatus.Invalid);
            }

            oldId = reader.GetGuid(0);
            accountId = reader.GetGuid(1);
            deviceId = reader.GetGuid(2);
            familyId = reader.GetGuid(3);
            expiresAt = reader.GetDateTime(4);
            consumedAt = reader.IsDBNull(5) ? null : reader.GetDateTime(5);
            revokedAt = reader.IsDBNull(6) ? null : reader.GetDateTime(6);
            deviceIsRevoked = reader.GetBoolean(7);
        }

        if (consumedAt is not null)
        {
            await using var revokeFamily = new NpgsqlCommand("""
                UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, NOW())
                WHERE token_family_id = @family
                """, connection, transaction);
            revokeFamily.Parameters.AddWithValue("family", familyId);
            await revokeFamily.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new RefreshRotationResult(RefreshRotationStatus.ReuseDetected);
        }

        if (revokedAt is not null || deviceIsRevoked)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new RefreshRotationResult(RefreshRotationStatus.DeviceRevoked);
        }

        if (expiresAt <= DateTime.UtcNow)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new RefreshRotationResult(RefreshRotationStatus.Expired);
        }

        var nextToken = CreateOpaqueToken();
        var nextId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var nextExpiry = now.Add(TokenLifetime);

        await using (var insert = new NpgsqlCommand("""
            INSERT INTO device_sessions
                (id, account_id, device_id, token_family_id, refresh_token_hash, issued_at, expires_at)
            VALUES (@id, @account, @device, @family, @hash, @issued, @expires)
            """, connection, transaction))
        {
            insert.Parameters.AddWithValue("id", nextId);
            insert.Parameters.AddWithValue("account", accountId);
            insert.Parameters.AddWithValue("device", deviceId);
            insert.Parameters.AddWithValue("family", familyId);
            insert.Parameters.AddWithValue("hash", NpgsqlDbType.Bytea, HashToken(nextToken));
            insert.Parameters.AddWithValue("issued", now);
            insert.Parameters.AddWithValue("expires", nextExpiry);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var consume = new NpgsqlCommand("""
            UPDATE device_sessions
            SET consumed_at = @now, replaced_by_session_id = @next
            WHERE id = @old AND consumed_at IS NULL AND revoked_at IS NULL
            """, connection, transaction))
        {
            consume.Parameters.AddWithValue("now", now);
            consume.Parameters.AddWithValue("next", nextId);
            consume.Parameters.AddWithValue("old", oldId);
            if (await consume.ExecuteNonQueryAsync(cancellationToken) != 1)
                throw new InvalidOperationException("Refresh session changed during rotation.");
        }

        await transaction.CommitAsync(cancellationToken);
        return new RefreshRotationResult(
            RefreshRotationStatus.Rotated,
            new IssuedRefreshSession(nextId, nextToken, nextExpiry));
    }

    public async Task RevokeDeviceSessionsAsync(
        Guid accountId, Guid deviceId, CancellationToken cancellationToken = default)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            UPDATE device_sessions
            SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE account_id = @account AND device_id = @device
            """, connection);
        command.Parameters.AddWithValue("account", accountId);
        command.Parameters.AddWithValue("device", deviceId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string CreateOpaqueToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] HashToken(string token) =>
        SHA256.HashData(Encoding.ASCII.GetBytes(token));
}
