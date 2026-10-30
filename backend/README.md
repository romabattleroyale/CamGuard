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

The schema stores opaque account/device identifiers, public identity/pre-key material, device-bound refresh-token hashes, and WebAuthn public credential records/challenge digests. It deliberately has no columns for passwords, private keys, plaintext messages, attachment names, or message bodies.

## Refresh-session implementation
The internal `RefreshSessionStore` currently:
- Generates refresh tokens from 256 bits of cryptographically secure randomness.
- Persists only SHA-256 digests of refresh tokens.
- Binds sessions to an existing, non-revoked account/device pair.
- Rotates tokens under a row lock and creates the successor in the same transaction.
- Detects reuse of a consumed token and revokes every session in that token family.
- Supports revoking all sessions belonging to a device.

The store is not exposed as an HTTP endpoint. Login, password/passkey verification, access-token issuance, authorization middleware, rate limiting, and operational abuse controls remain unimplemented. Do not expose refresh routes until those controls and concurrency tests are complete.

## Passkey schema (implementation pending)

Migration `003_webauthn_passkeys.sql` adds:
- `passkey_credentials`: credential ID, validated public COSE key, opaque user handle, signature counter, transports, optional AAGUID, display label and revocation timestamps.
- `webauthn_challenges`: SHA-256 challenge digests, purpose, expiry and single-use consumption state.

The schema does not implement WebAuthn registration or sign-in endpoints. Before enabling them, integrate a maintained WebAuthn relying-party library, pin the dependency, and validate the exact production RP ID/origin configuration. Registration must require an already authenticated and authorized account session; authentication challenges must be single-use, short-lived, bound to the intended ceremony, and consumed atomically. Enforce per-account credential limits and display-name bounds. Never log raw challenges, attestation/assertion payloads, credential secrets, or authorization headers. The WebAuthn library must validate challenge, origin, RP ID hash, user presence/verification policy, signature and credential ownership; do not implement these checks manually.

Microsoft's ASP.NET Core 10 passkey guidance describes the registration/attestation and authentication/assertion ceremonies and warns that custom implementations must protect ceremony state. See [Microsoft's passkey security guidance](https://learn.microsoft.com/aspnet/core/security/authentication/passkeys?view=aspnetcore-10.0). The selected library and its compatibility with browser, Android and iOS flows still require a dedicated review.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend.
