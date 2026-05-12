namespace Library.Shared;

public record Item(string Name, decimal Price, int Quantity);

public class CollectionPipeline
{
    public List<Item> ProcessItems(IEnumerable<Item> items, decimal minPrice)
    {
        return items
            .Where(i => i.Price >= minPrice)
            .Where(i => i.Quantity > 0)
            .OrderBy(i => i.Name)
            .Select(i => i with { Price = Math.Round(i.Price, 2) })
            .ToList();
    }

    public Dictionary<string, int> GroupByName(IEnumerable<Item> items)
    {
        return items
            .GroupBy(i => i.Name)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
    }
}
