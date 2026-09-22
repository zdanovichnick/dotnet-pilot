## EF Core Mapping for DDD Types

Configure in the entity's `IEntityTypeConfiguration`. IDs map through value converters. A
multi-column value object like `Money` maps as a complex property, so both amount and currency are
stored — a single-column converter would have to invent the currency on read:

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasConversion(id => id.Value, value => OrderId.From(value));
        builder.Property(o => o.CustomerId).HasConversion(id => id.Value, value => CustomerId.From(value));

        builder.ComplexProperty(o => o.Total, money =>
        {
            money.Property(m => m.Amount).HasColumnName("TotalAmount").HasPrecision(18, 2);
            money.Property(m => m.Currency).HasColumnName("TotalCurrency").HasMaxLength(3);
        });

        builder.OwnsMany(o => o.Items, items =>
        {
            items.WithOwner().HasForeignKey("OrderId");
            items.Property(i => i.ProductId).HasConversion(id => id.Value, value => ProductId.From(value));
        });
    }
}
```
