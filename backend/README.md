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

## Passkey storage and WebAuthn status

The internal first-account flow now has two non-HTTP building blocks:
- `FirstAccountEnrollmentOptionsFactory` generates a random opaque user handle and FIDO2 passkey options with a discoverable credential and required user verification, then stores the original short-lived ceremony options server-side.
- `FirstAccountPasskeyVerifier` reloads those server-owned options and asks Fido2NetLib to validate the attestation response and global credential-ID uniqueness. It returns an internal verified-result type that cannot be constructed from request data.

These services do not create an account/device, issue a session, or expose routes. Physical authenticator testing and the device-key proof/Signal Protocol integration are still required before a transactional enrollment service or public endpoint can be enabled.

Migration `003_webauthn_passkeys.sql` adds:
- `passkey_credentials`: credential ID, public COSE key, opaque user handle, signature counter, transports, optional AAGUID, display label and revocation timestamps.
- `webauthn_challenges`: SHA-256 challenge digests, short-lived serialized relying-party ceremony options, purpose, expiry and single-use consumption state.

The API references the maintained `Fido2.AspNet` 4.3.2 relying-party library and validates relying-party configuration at startup. Configure `Fido2:ServerDomain`, `Fido2:ServerName`, and `Fido2:Origins` (HTTPS only) before enabling any ceremony.

Internal stores now provide:
- `WebAuthnCeremonyStore`: persists short-lived options and challenge digests, atomically consumes each challenge once, rejects expired/replayed ceremonies, and supports expiry cleanup.
- `PasskeyCredentialStore`: stores public credential material only, rejects duplicate credential IDs, looks up credentials by ID/user handle, performs compare-and-swap signature-counter updates, and scopes revocation to the owning account.

The FIDO2 library must validate challenge, origin, RP ID hash, user presence/verification policy, signature and credential ownership. Do not implement these checks manually. Counter updates must be applied only after successful library verification; the compare-and-swap store method prevents stale concurrent writes. Authenticators that do not expose a signature counter may report zero.

**No WebAuthn registration or sign-in HTTP endpoints are implemented yet.** The stores and dependency are groundwork only. Do not expose endpoints until account authentication and authorization exist: registration must require an already authenticated account session, while authentication challenges must be short-lived, purpose-bound, single-use and consumed atomically. The credential ownership callback must check the account/user-handle relationship. Enforce per-account credential limits and display-name bounds. Never log raw challenges, attestation/assertion payloads, credential secrets, or authorization headers.

The selected library's browser, Android and iOS integration still requires a dedicated compatibility review. Use the exact `RequestNewCredential` / `MakeNewCredentialAsync` and `GetAssertionOptions` / `MakeAssertionAsync` validation APIs; do not accept client-supplied public keys or counters without successful relying-party verification.

See [Microsoft's passkey security guidance](https://learn.microsoft.com/aspnet/core/security/authentication/passkeys?view=aspnetcore-10.0) and the [FIDO2 .NET library](https://github.com/passwordless-lib/fido2-net-lib).

See [ADR-005: E2EE protocol library selection](../docs/security/ADR-005-E2EE-LIBRARY-SELECTION.md) for the current candidate review and the explicit production acceptance gates.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend.
