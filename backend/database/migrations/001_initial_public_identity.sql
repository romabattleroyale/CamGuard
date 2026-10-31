-- CsCMessage initial identity and public pre-key schema.
-- Private identity/session keys and plaintext messages MUST NEVER be stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    identity_public_key BYTEA NOT NULL CHECK (octet_length(identity_public_key) BETWEEN 32 AND 512),
    identity_key_fingerprint BYTEA NOT NULL CHECK (octet_length(identity_key_fingerprint) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_devices_account_active
    ON devices (account_id, created_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS signed_prekeys (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    key_id BIGINT NOT NULL CHECK (key_id >= 0),
    public_key BYTEA NOT NULL CHECK (octet_length(public_key) BETWEEN 32 AND 512),
    signature BYTEA NOT NULL CHECK (octet_length(signature) BETWEEN 32 AND 512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NULL,
    PRIMARY KEY (device_id, key_id)
);

CREATE INDEX IF NOT EXISTS ix_signed_prekeys_device_expiry
    ON signed_prekeys (device_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS one_time_prekeys (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    key_id BIGINT NOT NULL CHECK (key_id >= 0),
    public_key BYTEA NOT NULL CHECK (octet_length(public_key) BETWEEN 32 AND 512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ NULL,
    PRIMARY KEY (device_id, key_id)
);

CREATE INDEX IF NOT EXISTS ix_one_time_prekeys_available
    ON one_time_prekeys (device_id, key_id)
    WHERE claimed_at IS NULL;

COMMENT ON TABLE accounts IS
    'Opaque account identifiers only; authentication identifiers and secrets are handled separately.';
COMMENT ON TABLE devices IS
    'Public device identity material only. Never store private identity/session keys.';
COMMENT ON COLUMN devices.identity_public_key IS
    'Public identity key bytes; generated and managed by the client cryptographic library.';
COMMENT ON TABLE signed_prekeys IS
    'Public signed pre-keys and client-generated signatures only.';
COMMENT ON TABLE one_time_prekeys IS
    'Public one-time pre-keys only; claimed_at is set atomically when a bundle is issued.';

COMMIT;
