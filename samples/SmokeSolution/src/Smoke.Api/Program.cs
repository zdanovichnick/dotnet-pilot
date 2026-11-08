using Smoke.Application;
using Smoke.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddApplication().AddInfrastructure();

var app = builder.Build();

app.MapPost("/orders", async (PlaceOrder request, IOrderService orders, CancellationToken ct) =>
    Results.Ok(await orders.PlaceAsync(request.Customer, request.Total, ct)));

app.Run();

public sealed record PlaceOrder(string Customer, decimal Total);

public partial class Program;
