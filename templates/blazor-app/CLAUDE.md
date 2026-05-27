# Project: Blazor App

## Rendering Mode Decision
- **SSR (Static/Interactive Server)**: default — no WASM download, SEO-friendly, use for dashboards
- **WebAssembly**: use when offline capability or client-side-only execution is required
- **Auto**: SSR on first load, WASM after download — complex; only when latency matters

## Component Conventions

### File organization
```
Components/
  Pages/           ← routable pages (@page directive)
    Orders/
      OrderList.razor
      OrderDetail.razor
  Shared/          ← reusable components
    LoadingSpinner.razor
    ErrorBoundary.razor
  Layout/
    MainLayout.razor
    NavMenu.razor
```

### Component rules
- Use `@code` block, not code-behind `.cs` files
- Inject services via `@inject` at top of file
- Use `EventCallback<T>` for parent-child communication (not Action<T>)
- Prefer `<CascadingValue>` for auth context, theme, locale

### Forms
```razor
<EditForm Model="request" OnValidSubmit="HandleSubmit">
    <DataAnnotationsValidator />
    <ValidationSummary />
    <InputText @bind-Value="request.Name" />
    <button type="submit">Submit</button>
</EditForm>

@code {
    private CreateOrderRequest request = new();

    private async Task HandleSubmit()
    {
        var result = await OrderService.CreateAsync(request, CancellationToken);
        // handle result
    }
}
```

### State Management
- Component-local state: `@code` fields with `StateHasChanged()`
- Cross-component state: scoped service with `Action` change notification
- Avoid global state stores — prefer cascading parameters for shared context

## Key Conventions
- Always use `CancellationToken` from `ComponentBase.CancellationToken` for async calls
- Wrap data-loading in `OnInitializedAsync`; show loading state with `isLoading` flag
- Use `<ErrorBoundary>` around data-heavy sections
- Never use `Task.Result` in component code — Blazor has its own async rendering model
