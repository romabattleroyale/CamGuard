-- Private phone identity and public username for future account enrollment.
-- Existing accounts remain valid while the new verified-registration flow is implemented.
BEGIN;
ALTER TABLE accounts
 ADD COLUMN IF NOT EXISTS phone_e164 TEXT NULL,
 ADD COLUMN IF NOT EXISTS username TEXT NULL,
 ADD COLUMN IF NOT EXISTS username_normalized TEXT NULL,
 ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL;

DO $body$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_accounts_phone_format' AND conrelid='accounts'::regclass) THEN
  ALTER TABLE accounts ADD CONSTRAINT ck_accounts_phone_format
   CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_accounts_username_format' AND conrelid='accounts'::regclass) THEN
  ALTER TABLE accounts ADD CONSTRAINT ck_accounts_username_format
   CHECK ((username IS NULL AND username_normalized IS NULL) OR
    (username IS NOT NULL AND username_normalized IS NOT NULL AND
     username ~ '^[A-Za-z0-9_]{3,24}$' AND username_normalized=lower(username)));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_accounts_phone_verified' AND conrelid='accounts'::regclass) THEN
  ALTER TABLE accounts ADD CONSTRAINT ck_accounts_phone_verified
   CHECK ((phone_e164 IS NULL AND phone_verified_at IS NULL) OR
          (phone_e164 IS NOT NULL AND phone_verified_at IS NOT NULL));
 END IF;
END
$body$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_phone_e164
 ON accounts(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_username_normalized
 ON accounts(username_normalized) WHERE username_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
 id UUID PRIMARY KEY,
 phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 code_mac BYTEA NOT NULL CHECK (octet_length(code_mac)=32),
 requester_mac BYTEA NOT NULL CHECK (octet_length(requester_mac)=32),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
 verified_at TIMESTAMPTZ NULL,
 consumed_at TIMESTAMPTZ NULL,
 CONSTRAINT ck_phone_challenge_expiry CHECK (expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS ix_phone_challenge_phone_recent
 ON phone_verification_challenges(phone_e164,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_phone_challenge_expiry
 ON phone_verification_challenges(expires_at) WHERE consumed_at IS NULL;

COMMENT ON COLUMN accounts.phone_e164 IS 'Private verified contact number; never returned by public profile or social discovery.';
COMMENT ON COLUMN accounts.username IS 'Public social username, separate from the private phone number.';
COMMENT ON TABLE phone_verification_challenges IS 'Short-lived single-use phone proof state. MAC values use an application secret; raw codes and requester addresses are never persisted.';
COMMIT;
