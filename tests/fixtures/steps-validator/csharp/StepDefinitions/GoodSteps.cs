using Reqnroll;
using Xunit;

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
}
