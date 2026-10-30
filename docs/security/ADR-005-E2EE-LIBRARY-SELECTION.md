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


## Follow-up review: repository and package evidence (2026-10-30)

The public candidate evidence was rechecked against the upstream repositories and package metadata. The result is more restrictive than the initial summary:

### OpenE2EE Signal SDK — not approved, provenance/license gate unresolved

- Upstream repository: https://github.com/open-e2ee/signal-protocol-js
- The current GitHub README describes the project as an early `0.1.0-alpha`, says its API and persisted formats may change before 1.0, and labels the repository AGPL-3.0-or-later with a separate commercial license option.
- The npm registry search result currently advertises a newer `13.4.0` release under MIT OR Apache-2.0. These public surfaces do not agree on versioning and licensing. Do not infer that the package tarball is built from the reviewed repository or that its license is interchangeable.
- The upstream README states it is not wire-compatible with Signal Messenger/libsignal, has no independent security audit, and JavaScript engines cannot guarantee machine-level constant-time execution or reliable memory zeroization.
- Its published README documents browser support and a Vite browser example, but the browser storage notes identify same-origin JavaScript access to the key as a boundary. Capacitor WebView and native secure-vault behavior must be demonstrated independently; browser support is not proof of secure Android/iOS key custody.

**Decision:** do not install this dependency or use it for real user messages until the exact npm tarball, source commit, provenance, SPDX license, lockfile integrity, storage adapter, and security policy are reconciled. Require legal review if the artifact is AGPL or requires a commercial license.

### OpenMLS — credible standards implementation, but not a drop-in client

- Upstream: https://github.com/openmls/openmls
- The repository declares MIT licensing and implements MLS (RFC 9420).
- Its current README lists Android and iOS targets under “unsupported, but built on CI”; these are cross-compilation claims, not tested mobile-runtime support.
- OpenMLS is an MLS building block. Adopting it would require a reviewed Rust FFI layer, platform key custody, persistent state adapter, and an application protocol decision for 1:1 and group conversations.

**Decision:** keep as a research candidate, not as the immediate messaging engine. Do not mistake the unrelated Dart/Flutter wrapper ecosystem for a drop-in dependency in this React + Capacitor application.

### Signal libsignal — protocol fit, license/support trade-off

- Upstream: https://github.com/signalapp/libsignal
- GitHub currently reports AGPL-3.0.
- Signal's own repository says use outside Signal is unsupported. The Java/Swift bridge and native toolchain are viable investigation paths, but product licensing and maintenance risk remain open.

**Decision:** no production adoption without written legal review and an explicit support/maintenance plan.

## Updated implementation choice

No library is currently cleared for production. The next engineering spike is a **non-production compatibility harness**, not an app integration:

1. Pin exact upstream commit and package tarball; compare package contents to the claimed source and license.
2. Generate an SBOM and verify every transitive dependency and license.
3. Build a minimal Capacitor Android harness that calls the candidate only through an adapter boundary; do not store real user secrets or send real messages.
4. Verify key generation, encrypted local persistence, app restart, process death, lock/unlock, backup exclusion, and key deletion on physical Android hardware.
5. Repeat the storage and lifecycle tests on a physical iPhone before claiming cross-platform support.
6. Exercise published protocol vectors, replay, out-of-order delivery, ratchet advancement, concurrent device sessions, and malformed ciphertext.
7. Document what is not protected against a compromised/rooted device, malicious same-origin script, memory inspection, backups, or notification metadata.

The harness must use synthetic test identities and disposable test messages only. No public onboarding, key publication, or message transport endpoints are enabled by this ADR.
