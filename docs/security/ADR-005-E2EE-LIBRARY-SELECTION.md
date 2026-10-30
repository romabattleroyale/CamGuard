# ADR-005: E2EE protocol library selection

Status: **decision blocked pending technical and security validation**.
Date: 2026-10-30.
Scope: Android-first CsCMessage client (Capacitor), with iOS support required before general release.

## Context

CsCMessage requires real end-to-end encryption for direct messages, groups and attachments. Private identity/session keys and plaintext must remain on user devices. The server may store public key material and opaque ciphertext only.

The implementation must not create a home-grown cryptographic protocol, treat a successful encrypt/decrypt round trip as a security audit, or ship a library merely because it has an npm package.

## Candidates reviewed

### Signal libsignal

- Official repository: https://github.com/signalapp/libsignal
- Provides Java/Android, Swift/iOS and TypeScript surfaces backed by Rust.
- License: AGPL-3.0.
- The maintainers explicitly state that use outside Signal is unsupported and APIs/bridge layers may change without notice.
- Android distribution requires both `libsignal-android` and `libsignal-client`; the native packaging and supported JDK/NDK toolchain need validation.

**Assessment:** technically attractive, but not approved for this product until legal review of AGPL obligations and a maintenance/support plan are complete. Do not add it to the app as an assumed production dependency.

### OpenE2EE Signal Protocol SDK

- Repository/package: https://github.com/open-e2ee/signal-protocol-js
- Advertises MIT OR Apache-2.0 licensing and a TypeScript implementation/profile.
- Its own documentation says it is not affiliated with Signal, is not wire-compatible with Signal/libsignal, and has not been independently audited. The published test methodology includes private tests.

**Assessment:** may be evaluated as a prototype candidate only. It is not approved for production cryptography until independent review, reproducible test vectors, Android/iOS storage integration, and a full threat-model review are available. JavaScript runtime and key-zeroization limitations must be explicitly addressed.

### OpenMLS

- Project: https://openmls.tech/
- Rust implementation of the IETF Messaging Layer Security protocol with Android/iOS compilation targets.
- MLS is a strong candidate for group messaging, but does not by itself provide a drop-in Signal-style one-to-one Double Ratchet implementation or a ready-made Capacitor integration.

**Assessment:** evaluate for group messaging and possible shared protocol architecture, but do not assume it solves direct messaging or client lifecycle requirements. Confirm current license, API stability, platform bindings and interoperability before adoption.

## Decision

No candidate is approved for production yet.

1. Keep all message-send and key-publication endpoints disabled.
2. Do not persist plaintext, private keys, or locally generated secrets on the backend.
3. Do not add custom cryptographic primitives or a new protocol implementation.
4. Run a bounded technical spike for candidate portability, API stability, native bridge, secure local storage, multi-device behavior, protocol test vectors and interoperability.
5. Obtain a license review before selecting AGPL/GPL components for a distributed or hosted commercial product.
6. Require an independent security review before real users' messages are entrusted to the implementation.

## Required acceptance gates

- A maintained protocol implementation with a documented threat model and a license compatible with the product.
- Native Android and iOS implementations; private keys generated and used inside platform-protected storage where feasible.
- Cross-device test vectors: identity creation, pre-key publication, first contact, bidirectional messages, out-of-order delivery, replay rejection, ratchet advancement, device revocation and recovery.
- Multi-device fan-out with separate cryptographic sessions per recipient device.
- Server-side tests proving the API can only store opaque ciphertext and public material.
- No secrets or message content in logs, analytics, crash reports, push notifications or backups.
- Physical-device tests on Android and iOS before enabling onboarding or messaging endpoints.

## Consequences

This deliberately delays the first real encrypted message rather than creating a misleading or unsafe demo. UI demo messages remain explicitly labelled as local. The next implementation task is a comparative native proof-of-concept and threat-model review, not a public API endpoint.
