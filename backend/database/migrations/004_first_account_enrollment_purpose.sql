-- Distinguish anonymous first-account bootstrap from authenticated passkey enrollment.
-- Existing migration 003 remains immutable; this additive migration expands the purpose discriminator.

BEGIN;

ALTER TABLE webauthn_challenges
    DROP CONSTRAINT IF EXISTS webauthn_challenges_purpose_check;

ALTER TABLE webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_purpose_check
    CHECK (purpose IN ('first_enrollment', 'registration', 'authentication'));

COMMENT ON COLUMN webauthn_challenges.purpose IS
    'Purpose-bound ceremony: first_enrollment is anonymous bootstrap; registration adds a passkey to an authenticated account; authentication verifies an existing credential.';

COMMIT;
