using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Smoke.Application;
using Smoke.Domain;

namespace Smoke.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddDbContext<SmokeDbContext>(o => o.UseSqlite(SmokeDbContext.ConnectionString));
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddSingleton<OrderCache>();

        services.Scan(scan => scan
            .FromAssemblyOf<IOrderHandler>()
            .AddClasses(c => c.AssignableTo<IOrderHandler>())
            .AsImplementedInterfaces()
            .WithScopedLifetime());

        return services;
    }
}
