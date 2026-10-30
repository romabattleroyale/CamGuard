# ADR-004: First-account bootstrap and passkey enrollment

Status: proposed implementation contract; **not an enabled API**.
Scope: Android-first onboarding, with the protocol kept platform-neutral for later iOS and web clients.

## Decision

A new account is created only as the final result of a verified first-device enrollment ceremony. The client never chooses or submits an account ID to claim an existing account. The server generates the account ID, device ID, and opaque WebAuthn user handle.

The first passkey proves control of the newly enrolled authenticator. It does not, by itself, prove a real-world identity or authorize recovery of an existing account. Recovery and adding devices to an existing account are separate authenticated flows and are out of scope for first enrollment.

## First-device enrollment protocol

1. **Begin enrollment.** An unauthenticated client asks to begin a new account enrollment. The server applies IP/device/network abuse limits, creates a cryptographically random opaque WebAuthn user handle (1–64 bytes), generates registration options through Fido2NetLib, and stores a short-lived, single-use registration ceremony. The ceremony is explicitly marked as first-account enrollment and is not associated with an existing account. Return only the public options and a non-secret ceremony reference.
2. **Create passkey locally.** The Android client invokes the platform credential manager/passkey API using the returned RP ID and options. The authenticator creates and retains its private credential key. The app must not export, upload, log, or back up that private key.
3. **Prepare device identity locally.** Using the selected, audited Signal Protocol implementation, the client creates its device identity and initial public pre-key bundle locally. Private identity/session keys remain in device-protected storage. The exact Android library/storage integration must pass a separate compatibility and threat-model review before this step is enabled.
4. **Complete enrollment.** The client submits the attestation response, ceremony reference, a bounded display label, platform identifier, public device identity material, fingerprint, signed pre-key and a bounded initial set of one-time public pre-keys. It does not submit an account ID, private key, message, or arbitrary account ownership assertion.
5. **Verify and commit atomically.** The server loads the exact unexpired first-enrollment ceremony, verifies its purpose and challenge with Fido2NetLib, enforces RP ID/origin/user-presence and configured user-verification policy, validates the credential's user handle, and rejects credential-ID reuse. It verifies the device-key proof/signature using the selected protocol's documented verifier. Only after every check succeeds does one database transaction consume the ceremony and create the account, first device, passkey credential, signed pre-key and initial one-time pre-keys. A unique constraint and transaction isolation prevent two concurrent completions from claiming the same ceremony or credential.
6. **Establish the session.** The server issues a short-lived access token and device-bound refresh token only after commit. Persist only a hash of the refresh token. Return the server-generated opaque account/device IDs and public account metadata. Never return or escrow private key material.

## Failure and abuse handling

- Ceremony lifetime remains at most five minutes; challenges are random, hashed at rest, purpose-bound, and consumed exactly once.
- A failed verification does not create an account, device, credential, or pre-key. The client must restart enrollment after expiry or terminal failure.
- Rate-limit begin and completion operations; cap outstanding ceremonies per source and apply cleanup for expired rows. Responses must not reveal whether a credential belongs to another account.
- Enforce request-size, display-name, transport, key-size, pre-key-count and platform allowlists before database writes.
- Do not log request bodies, attestation/assertion payloads, raw challenges, credential IDs, user handles, public-key bundles, access/refresh tokens, or authorization headers. Emit only bounded event codes and correlation IDs.
- Account creation, ceremony consumption and credential/device/pre-key inserts must share one transaction. The existing ceremony store's standalone `ConsumeAsync` is not sufficient for this operation and must be refactored or complemented by a transaction-scoped method before endpoints are added.
- The current nullable `account_id` and `registration` purpose in `webauthn_challenges` are not enough to distinguish first enrollment from adding a passkey to an existing account. Add an explicit ceremony flow/purpose discriminator (with a migration and tests) before exposing routes.

## Existing-account device addition is a different flow

Adding a device or passkey to an existing account requires a currently authenticated session on an already trusted device (or a separately reviewed recovery procedure), fresh step-up authentication, explicit user confirmation, and a signed authorization binding the new device public-key fingerprint to the account. A caller-supplied account ID, email address, phone number, or possession of a newly-created passkey is never sufficient.

## Android-first compatibility gate

Before implementing HTTP endpoints:
- Verify Android Credential Manager/passkey creation and assertion behavior on supported Android versions and the target device matrix, including hybrid/cross-device flows and cancellation.
- Verify Fido2NetLib 4.3.2 API behavior for registration attestation validation, supported attestation formats, origin/RP ID configuration, user verification, duplicate credential handling and zero signature counters.
- Select and review a maintained Signal Protocol client library that actually supports the target Android runtime and the app's Capacitor/native bridge architecture. Do not invent a custom protocol or assume browser WebCrypto can safely replace the protocol library.
- Define secure local key storage, backup exclusion, device migration and lost-device/recovery behavior. Android Keystore protects wrapping keys; it does not automatically make arbitrary JavaScript-managed key material safe.
- Test a complete real-authenticator ceremony and device-key proof-of-possession on physical Android hardware before claiming passkey onboarding works.

## Required tests before enabling endpoints

- Successful first enrollment creates exactly one account, device and passkey credential.
- Wrong purpose, wrong RP ID/origin, invalid challenge, expired challenge, invalid attestation, wrong user handle and duplicate credential are rejected.
- Replayed and concurrent completion requests result in at most one committed account.
- Database failure at each insert rolls back account, device, credential, pre-keys and ceremony consumption together.
- Unverified device-key signatures, malformed/oversized key bundles and invalid pre-key signatures are rejected.
- Logs and error responses contain no credential secrets, tokens, challenge values or request payloads.
- Existing-account passkey enrollment cannot be reached through the first-account flow.

## Current implementation status

The repository currently has the account/device/public-pre-key schema, refresh-session primitives, WebAuthn challenge/credential stores and Fido2NetLib dependency. It has no registration, login, passkey, device-enrollment or messaging HTTP endpoints. This ADR documents the contract only; it does not make the prototype a working account system or authorize enabling routes.
