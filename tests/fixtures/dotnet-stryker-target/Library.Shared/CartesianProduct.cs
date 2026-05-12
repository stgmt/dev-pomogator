namespace Library.Shared;

public class CartesianProduct
{
    public List<Item> CrossJoin(IEnumerable<string> names, IEnumerable<decimal> prices)
    {
        var result = new List<Item>();
        foreach (var name in names)
        {
            foreach (var price in prices)
            {
                result.Add(new Item(name, price, 1));
            }
        }
        return result;
    }
}
