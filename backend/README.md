# CsCMessage API

ASP.NET Core API foundation with PostgreSQL public-identity and device-session schemas.

## Requirements
- .NET 10 SDK
- PostgreSQL 16+

## Run API
```bash
dotnet run --project backend/CsCMessage.Api
```

Health endpoint: `GET /health/live`.

Configure the database with `ConnectionStrings__CsCMessage`. The API registers the PostgreSQL refresh-session store only when this connection string is present. No public login or refresh endpoint is enabled yet.

## Database schema
Apply migrations in numeric order to an empty CsCMessage database:
```bash
for migration in backend/database/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

The schema stores opaque account/device identifiers, public identity/pre-key material, and device-bound refresh-token hashes. It deliberately has no columns for passwords, private keys, plaintext messages, attachment names, or message bodies.

## Refresh-session implementation
The internal `RefreshSessionStore` currently:
- Generates refresh tokens from 256 bits of cryptographically secure randomness.
- Persists only SHA-256 digests of refresh tokens.
- Binds sessions to an existing, non-revoked account/device pair.
- Rotates tokens under a row lock and creates the successor in the same transaction.
- Detects reuse of a consumed token and revokes every session in that token family.
- Supports revoking all sessions belonging to a device.

The store is not exposed as an HTTP endpoint. Login, password/passkey verification, access-token issuance, authorization middleware, rate limiting, and operational abuse controls remain unimplemented. Do not expose refresh routes until those controls and concurrency tests are complete.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend.
