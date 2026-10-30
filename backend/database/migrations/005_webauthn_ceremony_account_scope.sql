-- Enforce that WebAuthn ceremony purpose and account ownership cannot diverge.
-- first_enrollment is an anonymous bootstrap; all other ceremonies are account-bound.

BEGIN;

ALTER TABLE webauthn_challenges
    ADD CONSTRAINT ck_webauthn_challenge_account_scope
    CHECK (
        (purpose = 'first_enrollment' AND account_id IS NULL)
        OR
        (purpose IN ('registration', 'authentication') AND account_id IS NOT NULL)
    );

COMMENT ON CONSTRAINT ck_webauthn_challenge_account_scope ON webauthn_challenges IS
    'Anonymous first-account enrollment must have no account owner; passkey registration and authentication must be bound to an existing account.';

COMMIT;
