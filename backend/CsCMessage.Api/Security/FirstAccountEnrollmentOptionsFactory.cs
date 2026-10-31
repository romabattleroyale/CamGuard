using System.Security.Cryptography;
using Fido2NetLib;
using Fido2NetLib.Objects;

namespace CsCMessage.Api.Security;

internal sealed record FirstAccountEnrollmentStart(
    Guid CeremonyId,
    string PublicOptionsJson);

/// <summary>
/// Creates server-owned options for anonymous first-device passkey enrollment.
/// The caller must apply abuse limits before exposing these options over HTTP.
/// </summary>
internal sealed class FirstAccountEnrollmentOptionsFactory(
    IFido2 fido2,
    WebAuthnCeremonyStore ceremonies)
{
    public async Task<FirstAccountEnrollmentStart> CreateAsync(
        CancellationToken cancellationToken = default)
    {
        // User handles are opaque, random and independent of any client-supplied
        // account identifier or personal information.
        var userHandle = RandomNumberGenerator.GetBytes(32);
        var user = new Fido2User
        {
            Id = userHandle,
            Name = "CsCMessage account",
            DisplayName = "CsCMessage account"
        };

        var options = fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = user,
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required
            },
            // Do not request identifying attestation data; Fido2NetLib still
            // verifies the protocol response and credential proof.
            AttestationPreference = AttestationConveyancePreference.None,
            Extensions = new AuthenticationExtensionsClientInputs
            {
                CredProps = true
            }
        });

        if (options.Challenge is not { Length: >= 16 and <= 1024 })
            throw new InvalidOperationException("FIDO2 generated a challenge outside the supported bounds.");

        var optionsJson = options.ToJson();
        var ceremonyId = await ceremonies.CreateAsync(
            accountId: null,
            purpose: WebAuthnCeremonyPurpose.FirstAccountEnrollment,
            challenge: options.Challenge,
            optionsJson: optionsJson,
            cancellationToken: cancellationToken);

        return new FirstAccountEnrollmentStart(ceremonyId, optionsJson);
    }
}
