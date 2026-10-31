-- WebAuthn passkey credential and single-use challenge storage.
-- Store public credential material only; authenticator private keys never leave the authenticator.

BEGIN;

CREATE TABLE IF NOT EXISTS passkey_credentials (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE
        CHECK (octet_length(credential_id) BETWEEN 1 AND 1024),
    public_key BYTEA NOT NULL
        CHECK (octet_length(public_key) BETWEEN 1 AND 4096),
    user_handle BYTEA NOT NULL
        CHECK (octet_length(user_handle) BETWEEN 1 AND 64),
    signature_counter BIGINT NOT NULL DEFAULT 0
        CHECK (signature_counter >= 0),
    transports TEXT[] NOT NULL DEFAULT '{}',
    aaguid UUID NULL,
    display_name TEXT NOT NULL
        CHECK (length(display_name) BETWEEN 1 AND 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_passkey_credentials_account_active
    ON passkey_credentials (account_id, created_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id UUID PRIMARY KEY,
    account_id UUID NULL REFERENCES accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
    challenge_hash BYTEA NOT NULL UNIQUE
        CHECK (octet_length(challenge_hash) = 32),
    ceremony_options JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    CONSTRAINT ck_webauthn_challenge_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_webauthn_challenge_consumed
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS ix_webauthn_challenges_expiry
    ON webauthn_challenges (expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE passkey_credentials IS
    'WebAuthn public credential records only. Never store authenticator private keys.';
COMMENT ON COLUMN passkey_credentials.public_key IS
    'Public COSE credential key material validated by the WebAuthn relying-party implementation.';
COMMENT ON TABLE webauthn_challenges IS
    'Single-use WebAuthn ceremonies. ceremony_options retains short-lived relying-party options (including the nonce sent to the client) so the library can validate the response; never log options or raw challenges.';

COMMIT;
