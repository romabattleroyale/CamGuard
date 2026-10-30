# CsCMessage secure backend — architecture baseline

Status: approved product requirements; implementation is incremental and **not production-ready**.

## Non-negotiable security properties

- End-to-end encryption (E2EE) is mandatory for direct messages, groups, and attachments.
- The API, database, operators, logs, backups, and push provider must never receive plaintext message bodies, attachment plaintext, or private identity/session keys.
- Clients encrypt before upload and decrypt only on recipient devices. TLS remains mandatory in transit but is not a substitute for E2EE.
- No custom cryptographic protocol. Integrate a maintained, independently reviewed implementation of the Signal Protocol after a dedicated compatibility and security review.
- No message-send endpoint is enabled until client-side encryption, identity verification, replay protection, and key lifecycle tests exist.

## Initial service boundaries

- ASP.NET Core API: account/session lifecycle, device registration, public identity/pre-key distribution, encrypted-envelope transport, delivery metadata.
- PostgreSQL: accounts, devices, public identity keys, signed pre-keys, one-time pre-keys, opaque encrypted envelopes and minimal delivery state.
- SignalR: real-time notification that an opaque envelope is available. It must not carry plaintext.
- Object storage: encrypted attachment blobs only; clients encrypt locally before upload.
- Redis (later): ephemeral presence, rate-limit coordination and SignalR scale-out. Never a source of encryption keys.
- Push (later): generic notification text only; never message content or attachment names.

## Key lifecycle and multi-device model

1. Each device creates its private identity/session material locally using the selected audited protocol library.
2. The server stores only public identity/pre-key material and publishes signed pre-key bundles.
3. Sender fetches and verifies the recipient bundle, establishes/continues an encrypted session, and uploads opaque ciphertext.
4. Each recipient device has its own cryptographic session. Multi-device fan-out must encrypt separately for every authorized device.
5. Device removal revokes its public bundle and blocks future delivery. It cannot retroactively erase plaintext already obtained by that device.
6. Recovery must not silently escrow private keys with the service. Any encrypted backup/recovery design requires a separate threat model and explicit user consent.

## Data minimization

Persist only what transport requires: opaque ciphertext, sender/recipient device identifiers, timestamps, delivery state, and bounded protocol metadata. Do not log request bodies, ciphertext, authorization headers, tokens, key material, attachment names, or user message content. Avoid analytics that reveal contact graphs unless strictly necessary and disclosed.

## Planned implementation sequence

1. API foundation and health endpoint (this change).
2. PostgreSQL schema/migrations for accounts, devices and public pre-key material; no message plaintext columns.
3. Authentication, refresh-token rotation, device sessions and abuse controls.
4. Client E2EE integration with audited Signal Protocol implementation; interoperability and adversarial tests.
5. Opaque encrypted-envelope transport over REST + SignalR.
6. Client-side attachment encryption and encrypted object storage.
7. Multi-device, groups, push, backup/recovery, security review and external penetration test.

## Current limitations

The API foundation is only a process-health endpoint. It does not provide authentication, database persistence, SignalR, message delivery, E2EE, attachment storage, or production deployment. UI demo data must continue to be labelled as local/demo until those capabilities are implemented and tested.
