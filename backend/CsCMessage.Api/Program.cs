using CsCMessage.Api.Security;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();

var connectionString = builder.Configuration.GetConnectionString("CsCMessage");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
    builder.Services.AddScoped<RefreshSessionStore>();
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
