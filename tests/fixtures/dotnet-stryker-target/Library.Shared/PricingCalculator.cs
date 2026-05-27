namespace Library.Shared;

public class PricingCalculator
{
    public decimal Calculate(decimal price, int quantity, decimal discountPercent)
    {
        if (price < 0) throw new ArgumentException("Price must be non-negative", nameof(price));
        if (quantity < 0) throw new ArgumentException("Quantity must be non-negative", nameof(quantity));
        if (discountPercent < 0 || discountPercent > 100)
            throw new ArgumentException("Discount must be in [0, 100]", nameof(discountPercent));

        var subtotal = price * quantity;
        var discount = subtotal * (discountPercent / 100m);
        return subtotal - discount;
    }

    public int CalculateLoyaltyBonus(int yearsAsCustomer, int monthlyPurchases)
    {
        if (yearsAsCustomer <= 0) return 0;
        if (monthlyPurchases < 5) return yearsAsCustomer * 10;
        if (monthlyPurchases < 20) return yearsAsCustomer * 50;
        return yearsAsCustomer * 100;
    }
}
