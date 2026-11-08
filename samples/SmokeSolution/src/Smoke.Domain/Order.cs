namespace Smoke.Domain;

public sealed class Order
{
    public Guid Id { get; init; }
    public string Customer { get; set; } = "";
    public decimal Total { get; set; }
    public List<OrderLine> Lines { get; } = [];
}

public sealed class OrderLine
{
    public int Id { get; init; }
    public Guid OrderId { get; init; }
    public string Sku { get; set; } = "";
    public int Quantity { get; set; }
}
