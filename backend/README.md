# CsCMessage API

ASP.NET Core API foundation. This project is intentionally limited to process health until the authentication, device-key and E2EE design is implemented.

## Requirements
- .NET 10 SDK

## Run
```bash
dotnet run --project CsCMessage.Api
```

Health endpoint: `GET /health/live`.

## Security boundary
Do not add plaintext message persistence, plaintext logging, server-side decryption, or message-send endpoints before the audited client E2EE integration is ready. See [the architecture decision](../docs/security/SECURE_BACKEND_ARCHITECTURE.md).

This is not a production messaging backend.
