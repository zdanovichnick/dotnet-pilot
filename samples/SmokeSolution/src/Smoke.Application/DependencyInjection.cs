using Microsoft.Extensions.DependencyInjection;

namespace Smoke.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<HandlerRegistry>();
        return services;
    }
}
