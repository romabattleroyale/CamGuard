using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;

namespace CsCMessage.Api.Security;

/// <summary>
/// Provider boundary for phone ownership verification. The provider generates,
/// sends, and validates OTPs; CsCMessage never receives or stores the OTP itself.
/// </summary>
public interface IPhoneVerificationProvider
{
    Task<bool> StartAsync(string phoneE164, CancellationToken cancellationToken = default);
    Task<bool> CheckAsync(string phoneE164, string code, CancellationToken cancellationToken = default);
}

public sealed class TwilioVerifyOptions
{
    public const string SectionName = "TwilioVerify";
    public string? AccountSid { get; init; }
    public string? AuthToken { get; init; }
    public string? ServiceSid { get; init; }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountSid) &&
        !string.IsNullOrWhiteSpace(AuthToken) &&
        !string.IsNullOrWhiteSpace(ServiceSid);
}

/// <summary>
/// Twilio Verify adapter. Credentials are read from deployment configuration
/// (environment/secret store), never committed to appsettings or source control.
/// The API deliberately returns only a boolean and never logs phone numbers,
/// verification codes, provider response bodies, or credentials.
/// </summary>
public sealed class TwilioVerifyPhoneProvider(
    HttpClient httpClient,
    IOptions<TwilioVerifyOptions> options) : IPhoneVerificationProvider
{
    private readonly TwilioVerifyOptions settings = options.Value;

    public async Task<bool> StartAsync(
        string phoneE164,
        CancellationToken cancellationToken = default)
    {
        ValidatePhone(phoneE164);
        EnsureConfigured();

        using var request = CreateRequest(
            $"/v2/Services/{Uri.EscapeDataString(settings.ServiceSid!)}/Verifications",
            new Dictionary<string, string>
            {
                ["To"] = phoneE164,
                ["Channel"] = "sms"
            });

        using var response = await httpClient.SendAsync(request, cancellationToken);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> CheckAsync(
        string phoneE164,
        string code,
        CancellationToken cancellationToken = default)
    {
        ValidatePhone(phoneE164);
        if (code.Length is < 4 or > 10 || code.Any(character => character is < '0' or > '9'))
            return false;
        EnsureConfigured();

        using var request = CreateRequest(
            $"/v2/Services/{Uri.EscapeDataString(settings.ServiceSid!)}/VerificationCheck",
            new Dictionary<string, string>
            {
                ["To"] = phoneE164,
                ["Code"] = code
            });

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return false;

        // Parse only the status field. Never retain or log the submitted code or
        // the provider response payload.
        using var body = await System.Text.Json.JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        return body.RootElement.TryGetProperty("status", out var status) &&
               status.ValueKind == System.Text.Json.JsonValueKind.String &&
               string.Equals(status.GetString(), "approved", StringComparison.Ordinal);
    }

    private HttpRequestMessage CreateRequest(string path, Dictionary<string, string> fields)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new FormUrlEncodedContent(fields)
        };
        var credentials = Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"{settings.AccountSid}:{settings.AuthToken}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private void EnsureConfigured()
    {
        if (!settings.IsConfigured)
            throw new InvalidOperationException("Phone verification provider is not configured.");
    }

    private static void ValidatePhone(string phoneE164)
    {
        ArgumentNullException.ThrowIfNull(phoneE164);
        if (phoneE164.Length is < 9 or > 16 ||
            phoneE164[0] != '+' ||
            phoneE164[1] is < '1' or > '9' ||
            phoneE164.Skip(2).Any(character => character is < '0' or > '9'))
            throw new ArgumentException("Phone number must use international E.164 format.", nameof(phoneE164));
    }
}
