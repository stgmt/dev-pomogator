using Library.Shared;
using Xunit;

namespace UnitTests;

[Trait("Category", "Unit")]
public class CartesianProductTests
{
    private readonly CartesianProduct _sut = new();

    [Fact]
    public void CrossJoin_CardinalityIsNxM()
    {
        var names = new[] { "A", "B", "C" };
        var prices = new[] { 10m, 20m };
        var result = _sut.CrossJoin(names, prices);
        Assert.Equal(6, result.Count);
    }

    [Fact]
    public void CrossJoin_EmptyNames_ReturnsEmpty()
    {
        var result = _sut.CrossJoin(Array.Empty<string>(), new[] { 10m });
        Assert.Empty(result);
    }

    [Fact]
    public void CrossJoin_EmptyPrices_ReturnsEmpty()
    {
        var result = _sut.CrossJoin(new[] { "A" }, Array.Empty<decimal>());
        Assert.Empty(result);
    }

    [Fact]
    public void CrossJoin_AllUniqueCombinations()
    {
        var names = new[] { "A", "B" };
        var prices = new[] { 10m, 20m };
        var result = _sut.CrossJoin(names, prices);
        var distinct = result.Select(i => (i.Name, i.Price)).Distinct().ToList();
        Assert.Equal(result.Count, distinct.Count);
    }
}
