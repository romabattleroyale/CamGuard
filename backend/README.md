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

## Database schema
Apply migrations in numeric order to an empty CsCMessage database:
```bash
for migration in backend/database/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

The schema stores opaque account/device identifiers, public identity/pre-key material, and device-bound refresh-token hashes. It deliberately has no columns for passwords, private keys, plaintext messages, attachment names, or message bodies.

## Session security contract (implementation pending)
- Generate refresh tokens from a cryptographically secure random source with at least 256 bits of entropy; return the raw token only once to the client.
- Persist only the SHA-256 digest of each refresh token. Hashing is appropriate here because tokens are high-entropy random secrets, not human passwords.
- Bind every session to both its account and registered device.
- Rotate refresh tokens atomically: consume the presented token and create its successor in one transaction.
- If a consumed token is presented again, treat it as possible theft and revoke every session in that token family.
- Revoke device sessions when that device is revoked.
- Never log tokens, authorization headers, request bodies, private keys, or message content.
- Use short-lived access credentials; do not use refresh tokens as API access tokens.

This schema does not implement login, password/passkey verification, token issuance/rotation, authorization middleware, or rate limiting. No authentication endpoint is enabled yet.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend.
