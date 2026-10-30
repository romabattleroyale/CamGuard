using CsCMessage.Api.Security;
using Fido2NetLib;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();

var connectionString = builder.Configuration.GetConnectionString("CsCMessage");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
    builder.Services.AddScoped<RefreshSessionStore>();
    builder.Services.AddScoped<WebAuthnCeremonyStore>();
    builder.Services.AddScoped<PasskeyCredentialStore>();
}

var relyingPartyDomain = builder.Configuration["Fido2:ServerDomain"];
var relyingPartyName = builder.Configuration["Fido2:ServerName"];
var relyingPartyOrigins = builder.Configuration.GetSection("Fido2:Origins").Get<string[]>();

var hasAnyRelyingPartySetting =
    !string.IsNullOrWhiteSpace(relyingPartyDomain) ||
    !string.IsNullOrWhiteSpace(relyingPartyName) ||
    relyingPartyOrigins is { Length: > 0 };

if (hasAnyRelyingPartySetting)
{
    if (string.IsNullOrWhiteSpace(relyingPartyDomain) ||
        string.IsNullOrWhiteSpace(relyingPartyName) ||
        relyingPartyOrigins is not { Length: > 0 } ||
        relyingPartyOrigins.Any(origin => !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
                                          uri.Scheme != Uri.UriSchemeHttps))
    {
        throw new InvalidOperationException(
            "WebAuthn requires Fido2:ServerDomain, Fido2:ServerName and one or more HTTPS Fido2:Origins.");
    }

    builder.Services.AddFido2(options =>
    {
        options.RPID = relyingPartyDomain;
        options.RPName = relyingPartyName;
        options.Origins = relyingPartyOrigins.ToHashSet(StringComparer.OrdinalIgnoreCase);
    });

    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        builder.Services.AddScoped<FirstAccountEnrollmentOptionsFactory>();
        builder.Services.AddScoped<FirstAccountPasskeyVerifier>();
    }
}

var app = builder.Build();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    await next();
});

app.MapHealthChecks("/health/live");

app.Run();

public partial class Program { }
