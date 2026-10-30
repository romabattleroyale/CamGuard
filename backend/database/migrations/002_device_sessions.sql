-- Device-bound refresh-token sessions.
-- Store only SHA-256 hashes of cryptographically random refresh tokens.
-- Never persist raw access/refresh tokens or password material here.

BEGIN;

CREATE TABLE IF NOT EXISTS device_sessions (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL,
    device_id UUID NOT NULL,
    token_family_id UUID NOT NULL,
    refresh_token_hash BYTEA NOT NULL UNIQUE
        CHECK (octet_length(refresh_token_hash) = 32),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    replaced_by_session_id UUID NULL,
    CONSTRAINT fk_device_sessions_device
        FOREIGN KEY (device_id, account_id)
        REFERENCES devices(id, account_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_device_sessions_id_family
        UNIQUE (id, token_family_id),
    CONSTRAINT fk_device_sessions_replacement_family
        FOREIGN KEY (replaced_by_session_id, token_family_id)
        REFERENCES device_sessions(id, token_family_id),
    CONSTRAINT ck_device_sessions_expiry
        CHECK (expires_at > issued_at),
    CONSTRAINT ck_device_sessions_consumed
        CHECK (consumed_at IS NULL OR consumed_at >= issued_at),
    CONSTRAINT ck_device_sessions_revoked
        CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
    CONSTRAINT ck_device_sessions_not_self_replaced
        CHECK (replaced_by_session_id IS NULL OR replaced_by_session_id <> id)
);

CREATE INDEX IF NOT EXISTS ix_device_sessions_account_active
    ON device_sessions (account_id, expires_at)
    WHERE revoked_at IS NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_device_sessions_device_active
    ON device_sessions (device_id, expires_at)
    WHERE revoked_at IS NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_device_sessions_family
    ON device_sessions (token_family_id);

COMMENT ON TABLE device_sessions IS
    'Device-bound refresh-token rotation history. Stores token hashes only, never bearer tokens.';
COMMENT ON COLUMN device_sessions.refresh_token_hash IS
    'SHA-256 digest of a cryptographically random refresh token; raw token is returned once to the client and never persisted.';
COMMENT ON COLUMN device_sessions.consumed_at IS
    'Set atomically on successful rotation; reuse of a consumed token must revoke the entire token family.';
COMMENT ON COLUMN device_sessions.replaced_by_session_id IS
    'Links a rotated token to its successor within the same token family.';

COMMIT;
