using System.Security.Cryptography;
using Fido2NetLib;
using Fido2NetLib.Objects;

namespace CsCMessage.Api.Security;

/// <summary>
/// Result of a successful FIDO2 registration verification. Its constructor is
/// internal so HTTP/request data cannot manufacture a verified credential result.
/// </summary>
internal sealed class VerifiedFirstAccountPasskey
{
    private readonly byte[] credentialId;
    private readonly byte[] publicKey;
    private readonly byte[] userHandle;

    internal VerifiedFirstAccountPasskey(
        Guid ceremonyId,
        byte[] credentialId,
        byte[] publicKey,
        byte[] userHandle,
        uint signatureCounter)
    {
        CeremonyId = ceremonyId;
        this.credentialId = credentialId.ToArray();
        this.publicKey = publicKey.ToArray();
        this.userHandle = userHandle.ToArray();
        SignatureCounter = signatureCounter;
    }

    internal Guid CeremonyId { get; }
    internal byte[] CredentialId => credentialId.ToArray();
    internal byte[] PublicKey => publicKey.ToArray();
    internal byte[] UserHandle => userHandle.ToArray();
    internal uint SignatureCounter { get; }
}

/// <summary>
/// Verifies first-account passkey attestations using Fido2NetLib. This service
/// does not create accounts or expose HTTP endpoints; persistence is a separate
/// atomic step that can accept only this internal verified-result type.
/// </summary>
internal sealed class FirstAccountPasskeyVerifier(
    IFido2 fido2,
    WebAuthnCeremonyStore ceremonies,
    PasskeyCredentialStore passkeys)
{
    public async Task<VerifiedFirstAccountPasskey?> VerifyAsync(
        Guid ceremonyId,
        AuthenticatorAttestationRawResponse attestationResponse,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(attestationResponse);

        var ceremony = await ceremonies.GetPendingAsync(
            ceremonyId,
            WebAuthnCeremonyPurpose.FirstAccountEnrollment,
            accountId: null,
            cancellationToken);

        if (ceremony is null || ceremony.AccountId is not null)
            return null;

        var originalOptions = CredentialCreateOptions.FromJson(ceremony.OptionsJson);
        if (originalOptions.User?.Id is not { Length: >= 1 and <= 64 } expectedUserHandle)
            throw new InvalidOperationException("Stored first-enrollment options do not contain a valid opaque user handle.");

        var credential = await fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
        {
            AttestationResponse = attestationResponse,
            OriginalOptions = originalOptions,
            IsCredentialIdUniqueToUserCallback = async (args, callbackCancellationToken) =>
                await passkeys.IsCredentialIdAvailableAsync(args.CredentialId, callbackCancellationToken)
        }, cancellationToken: cancellationToken);

        if (credential.User?.Id is not { Length: >= 1 and <= 64 } verifiedUserHandle ||
            !CryptographicOperations.FixedTimeEquals(expectedUserHandle, verifiedUserHandle))
            throw new InvalidOperationException("Verified passkey user handle does not match the server-issued enrollment handle.");

        if (credential.Id is not { Length: >= 1 and <= 1024 } ||
            credential.PublicKey is not { Length: >= 1 and <= 4096 })
            throw new InvalidOperationException("FIDO2 library returned credential material outside the supported storage bounds.");

        return new VerifiedFirstAccountPasskey(
            ceremony.Id,
            credential.Id,
            credential.PublicKey,
            verifiedUserHandle,
            credential.SignCount);
    }
}
