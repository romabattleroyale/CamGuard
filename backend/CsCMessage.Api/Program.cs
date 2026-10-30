var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();

var app = builder.Build();

app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.ReferrerPolicy = "no-referrer";
    context.Response.Headers.XFrameOptions = "DENY";
    await next();
});

app.MapHealthChecks("/health/live");

app.Run();

public partial class Program;
