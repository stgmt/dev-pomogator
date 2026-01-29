using Reqnroll;
using Xunit;
using System.Collections.Generic;

namespace StepsValidator.Fixtures.CSharp.StepDefinitions;

/// <summary>
/// Example of GOOD step definitions with proper assertions.
/// Used for testing the steps validator.
/// </summary>
[Binding]
public class GoodSteps
{
    private readonly ScenarioContext _scenarioContext;
    private string? _result;

    public GoodSteps(ScenarioContext scenarioContext)
    {
        _scenarioContext = scenarioContext;
    }

    [Given(@"a valid setup")]
    public void GivenAValidSetup()
    {
        // Given steps don't need assertions
        _result = "setup complete";
        Console.WriteLine("[GoodSteps] Setup complete");
    }

    [When(@"an action is performed")]
    public void WhenAnActionIsPerformed()
    {
        // When steps don't need assertions
        _result = "action done";
        Console.WriteLine("[GoodSteps] Action performed");
    }

    [Then(@"the result is ""(.*)""")]
    public void ThenTheResultIs(string expected)
    {
        // ✅ GOOD: Assert.Equal
        Assert.Equal(expected, _result);
        Console.WriteLine($"[GoodSteps] ✅ Result verified: {_result}");
    }

    [Then(@"the result is not null")]
    public void ThenTheResultIsNotNull()
    {
        // ✅ GOOD: Assert.NotNull
        Assert.NotNull(_result);
    }

    [Then(@"the result contains ""(.*)""")]
    public void ThenTheResultContains(string substring)
    {
        // ✅ GOOD: Assert.Contains
        Assert.Contains(substring, _result);
    }

    [Then(@"the operation succeeds")]
    public void ThenTheOperationSucceeds()
    {
        // ✅ GOOD: throw with condition check
        if (_result == null)
        {
            throw new InvalidOperationException("Result NOT FOUND");
        }

        Console.WriteLine("[GoodSteps] ✅ Operation succeeded");
    }

    [Then(@"the data is valid")]
    public void ThenTheDataIsValid()
    {
        // ✅ GOOD: Assert.True
        Assert.True(!string.IsNullOrEmpty(_result), "Result should not be empty");
    }

    [Then(@"the page URL matches ""(.*)""")]
    public async Task ThenThePageUrlMatches(string expectedUrl)
    {
        // ✅ GOOD: Playwright WaitForURLAsync pattern
        // Validator looks for: .WaitForURLAsync(
        // Simulating pattern for validator (no real Playwright dependency in fixture)
        var page = new MockPage();
        await page.WaitForURLAsync(expectedUrl, new MockOptions { Timeout = 10000 });
    }

    [Then(@"the element is visible")]
    public async Task ThenTheElementIsVisible()
    {
        // ✅ GOOD: Playwright WaitForSelectorAsync pattern
        // Validator looks for: .WaitForSelectorAsync( or .WaitForAsync(
        // Simulating pattern for validator (no real Playwright dependency in fixture)
        var locator = new MockLocator();
        await locator.WaitForSelectorAsync(new MockWaitOptions { State = "Visible" });
    }

    // Mock classes for Playwright patterns (validator recognizes method calls)
    private class MockPage
    {
        public Task WaitForURLAsync(string url, object options) => Task.CompletedTask;
    }

    private class MockLocator
    {
        public Task WaitForSelectorAsync(object options) => Task.CompletedTask;
    }

    private class MockOptions
    {
        public int Timeout { get; set; }
    }

    private class MockWaitOptions
    {
        public string State { get; set; } = "";
    }

    [Then(@"the result contains (\d+) items")]
    public void ThenTheResultContainsItems(int count)
    {
        // ✅ GOOD: Метод делегирование
        ThenResultContainsItems(count);
    }

    private void ThenResultContainsItems(int count)
    {
        var result = _scenarioContext.Get<List<object>>("Result");
        if (result == null || result.Count != count)
        {
            throw new InvalidOperationException($"Expected {count} items but got {result?.Count ?? 0}");
        }
    }

    [Then(@"the result is not empty")]
    public void ThenTheResultIsNotEmpty()
    {
        // ✅ GOOD: Многострочный conditional throw
        var result = _scenarioContext.Get<List<object>>("Result");
        if (result == null || result.Count == 0)
        {
            throw new InvalidOperationException("Expected non-empty result but got null or empty");
        }
    }

    [Then(@"the token exists")]
    public async Task ThenTheTokenExists()
    {
        // ✅ GOOD: Null-coalescing throw (simulated - no real DB context in fixture)
        var tokenId = _scenarioContext.Get<string>("TokenId");
        var token = _scenarioContext.TryGetValue("Token", out string? t) ? t : null;
        
        if (token == null)
        {
            throw new InvalidOperationException($"Token with Id {tokenId} NOT FOUND");
        }
    }

    [StepDefinition(@"the data is validated:")]
    public void ThenTheDataIsValidated(Table table)
    {
        // ✅ GOOD: StepDefinition атрибут с assertions
        var data = _scenarioContext.Get<Dictionary<string, string>>("Data");
        foreach (var row in table.Rows)
        {
            var field = row["Field"];
            var expectedValue = row["Value"];
            if (data == null || !data.ContainsKey(field) || data[field] != expectedValue)
            {
                throw new InvalidOperationException($"Field {field} mismatch. Expected: {expectedValue}, Actual: {data?[field] ?? "null"}");
            }
        }
    }
}
