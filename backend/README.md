# CsCMessage API

ASP.NET Core API foundation with the initial PostgreSQL public-identity schema.

## Requirements
- .NET 10 SDK
- PostgreSQL 16+

## Run API
```bash
dotnet run --project backend/CsCMessage.Api
```

Health endpoint: `GET /health/live`.

## Database schema
Apply the initial migration to an empty CsCMessage database:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/migrations/001_initial_public_identity.sql
```

The schema stores opaque account/device identifiers and **public** identity/pre-key material only. It deliberately has no columns for passwords, private keys, plaintext messages, attachment names, or message bodies. One-time pre-key claiming must later be implemented as a single atomic database transaction.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend. Authentication, authorization, key-bundle publication, atomic one-time pre-key claiming, migrations tooling, rate limiting, and E2EE are not implemented yet.
