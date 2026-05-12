using Library.Shared;
using Xunit;

namespace UnitTests;

[Trait("Category", "Unit")]
public class PricingCalculatorTests
{
    private readonly PricingCalculator _sut = new();

    [Fact]
    public void Calculate_PriceQuantityNoDiscount_ReturnsSubtotal()
    {
        Assert.Equal(100m, _sut.Calculate(price: 10m, quantity: 10, discountPercent: 0m));
    }

    [Fact]
    public void Calculate_FullDiscount_ReturnsZero()
    {
        Assert.Equal(0m, _sut.Calculate(price: 10m, quantity: 10, discountPercent: 100m));
    }

    [Fact]
    public void Calculate_HalfDiscount_ReturnsHalfSubtotal()
    {
        Assert.Equal(50m, _sut.Calculate(price: 10m, quantity: 10, discountPercent: 50m));
    }

    [Fact]
    public void Calculate_ZeroQuantity_ReturnsZero()
    {
        Assert.Equal(0m, _sut.Calculate(price: 10m, quantity: 0, discountPercent: 10m));
    }

    [Fact]
    public void Calculate_NegativePrice_Throws()
    {
        Assert.Throws<ArgumentException>(() => _sut.Calculate(price: -1m, quantity: 1, discountPercent: 0m));
    }

    [Fact]
    public void Calculate_NegativeQuantity_Throws()
    {
        Assert.Throws<ArgumentException>(() => _sut.Calculate(price: 1m, quantity: -1, discountPercent: 0m));
    }

    [Fact]
    public void Calculate_DiscountAbove100_Throws()
    {
        Assert.Throws<ArgumentException>(() => _sut.Calculate(price: 1m, quantity: 1, discountPercent: 101m));
    }

    [Fact]
    public void Calculate_DiscountBelow0_Throws()
    {
        Assert.Throws<ArgumentException>(() => _sut.Calculate(price: 1m, quantity: 1, discountPercent: -1m));
    }

    [Fact]
    public void CalculateLoyaltyBonus_ZeroYears_ReturnsZero()
    {
        Assert.Equal(0, _sut.CalculateLoyaltyBonus(yearsAsCustomer: 0, monthlyPurchases: 100));
    }

    [Fact]
    public void CalculateLoyaltyBonus_LowFreq_ReturnsBaseMultiplier()
    {
        Assert.Equal(20, _sut.CalculateLoyaltyBonus(yearsAsCustomer: 2, monthlyPurchases: 3));
    }

    [Fact]
    public void CalculateLoyaltyBonus_MidFreq_Returns50Multiplier()
    {
        Assert.Equal(100, _sut.CalculateLoyaltyBonus(yearsAsCustomer: 2, monthlyPurchases: 10));
    }

    [Fact]
    public void CalculateLoyaltyBonus_HighFreq_Returns100Multiplier()
    {
        Assert.Equal(200, _sut.CalculateLoyaltyBonus(yearsAsCustomer: 2, monthlyPurchases: 30));
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(5, 10)]
    [InlineData(100, 50)]
    [InlineData(0.01, 1)]
    public void Calculate_ZeroDiscount_EqualsSubtotal(decimal price, int quantity)
    {
        var actual = _sut.Calculate(price, quantity, 0m);
        Assert.Equal(price * quantity, actual);
    }
}
