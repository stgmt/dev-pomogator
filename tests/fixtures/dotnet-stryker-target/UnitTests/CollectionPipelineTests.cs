using Library.Shared;
using Xunit;

namespace UnitTests;

[Trait("Category", "Unit")]
public class CollectionPipelineTests
{
    private readonly CollectionPipeline _sut = new();

    [Fact]
    public void ProcessItems_EmptyInput_ReturnsEmpty()
    {
        var result = _sut.ProcessItems(Array.Empty<Item>(), minPrice: 10m);
        Assert.Empty(result);
    }

    [Fact]
    public void ProcessItems_FiltersOutBelowMinPrice()
    {
        var input = new[] { new Item("A", 5m, 1), new Item("B", 15m, 1) };
        var result = _sut.ProcessItems(input, minPrice: 10m);
        Assert.Single(result);
        Assert.Equal("B", result[0].Name);
    }

    [Fact]
    public void ProcessItems_FiltersOutZeroQuantity()
    {
        var input = new[] { new Item("A", 100m, 0), new Item("B", 100m, 1) };
        var result = _sut.ProcessItems(input, minPrice: 10m);
        Assert.Single(result);
        Assert.Equal("B", result[0].Name);
    }

    [Fact]
    public void ProcessItems_SortsByName()
    {
        var input = new[] { new Item("Z", 100m, 1), new Item("A", 100m, 1), new Item("M", 100m, 1) };
        var result = _sut.ProcessItems(input, minPrice: 10m);
        Assert.Equal(new[] { "A", "M", "Z" }, result.Select(i => i.Name));
    }

    [Fact]
    public void ProcessItems_RoundsPriceTo2Decimals()
    {
        var input = new[] { new Item("A", 9.99999m, 1) };
        var result = _sut.ProcessItems(input, minPrice: 1m);
        Assert.Equal(10m, result[0].Price);
    }

    [Fact]
    public void ProcessItems_PreservesCardinalityInvariant_FilteredItemsOnly()
    {
        var input = new[]
        {
            new Item("A", 5m, 1),
            new Item("B", 15m, 1),
            new Item("C", 100m, 0),
            new Item("D", 20m, 5),
        };
        var result = _sut.ProcessItems(input, minPrice: 10m);
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public void GroupByName_SumsQuantities()
    {
        var input = new[] { new Item("A", 1m, 3), new Item("A", 1m, 4), new Item("B", 1m, 5) };
        var result = _sut.GroupByName(input);
        Assert.Equal(7, result["A"]);
        Assert.Equal(5, result["B"]);
    }

    [Fact]
    public void GroupByName_EmptyInput_ReturnsEmpty()
    {
        var result = _sut.GroupByName(Array.Empty<Item>());
        Assert.Empty(result);
    }
}
