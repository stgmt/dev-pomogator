using Reqnroll;
using System.Collections.Generic;

namespace StepsValidator.Fixtures.CSharp.StepDefinitions;

/// <summary>
/// Example of BAD step definitions without proper assertions.
/// Used for testing the steps validator.
/// </summary>
[Binding]
public class BadSteps
{
    private readonly ScenarioContext _scenarioContext;

    public BadSteps(ScenarioContext scenarioContext)
    {
        _scenarioContext = scenarioContext;
    }

    [Then(@"the result is verified")]
    public void ThenTheResultIsVerified()
    {
        // ❌ BAD: Only Console.WriteLine, no assertion!
        Console.WriteLine("[BadSteps] ✅ Result verified");
        Console.WriteLine("[BadSteps] All good!");
    }

    [Then(@"the operation completes")]
    public void ThenTheOperationCompletes()
    {
        // ❌ BAD: Empty body
    }

    [Then(@"the data is processed")]
    public void ThenTheDataIsProcessed()
    {
        // ❌ BAD: Only return statement
        return;
    }

    [Then(@"the feature works")]
    public async Task ThenTheFeatureWorks()
    {
        // ❌ BAD: Only Task.CompletedTask
        return;
    }

    [Then(@"the validation passes")]
    public void ThenTheValidationPasses()
    {
        // ❌ BAD: PendingStepException
        throw new PendingStepException();
    }

    [Then(@"the system responds")]
    public void ThenTheSystemResponds()
    {
        // ❌ BAD: NotImplementedException
        throw new NotImplementedException();
    }

    [Then(@"the log is written")]
    public void ThenTheLogIsWritten()
    {
        // ⚠️ WARNING: TODO comment + only logging
        // TODO: implement proper assertion
        Console.WriteLine("[BadSteps] Log written");
    }

    [Then(@"the API is called")]
    public void ThenTheApiIsCalled()
    {
        // ⚠️ WARNING: STUBBED
        Console.WriteLine("[BadSteps] API call STUBBED");
    }

    [Then(@"the cache is updated")]
    public void ThenTheCacheIsUpdated()
    {
        // ⚠️ WARNING: SKIPPED
        Console.WriteLine("[BadSteps] ⏭️ SKIP - cache update not implemented");
    }

    [Then(@"all items have type ""(.*)""")]
    public void ThenAllItemsHaveType(string itemType)
    {
        // ❌ BAD: Только лог с комментарием "уже проверено"
        var result = _scenarioContext.Get<List<object>>("Items");
        // Already checked by filter in When step
        Console.WriteLine($"[BadSteps] ✅ All items filtered to type='{itemType}'");
    }

    [Then(@"all items are updated")]
    public void ThenAllItemsAreUpdated()
    {
        // ❌ BAD: "Simplified check" - заглушка
        // This is a simplified check - verify at least one item changed
        Console.WriteLine("[BadSteps] ✅ Items update verified (simplified check)");
    }

    [Then(@"missing IDs are skipped")]
    public void ThenMissingIdsAreSkipped()
    {
        // ❌ BAD: "Already validated" - делегирование
        // Already validated via the Result contains N items step
        Console.WriteLine("[BadSteps] ✅ Missing IDs silently skipped");
    }

    [Then(@"the API returns token")]
    public void ThenTheApiReturnsToken()
    {
        // ❌ BAD: STUBBED с return
        Console.WriteLine("[BadSteps] Token verification STUBBED");
        if (!_scenarioContext.ContainsKey("Token"))
        {
            Console.WriteLine("[BadSteps] ⚠️ No token in context (expected - API stubbed)");
            return;
        }
        Console.WriteLine("[BadSteps] ✅ Token step SKIPPED");
    }

    [Then(@"the system logs ""(.*)"" at (.*) level")]
    public void ThenTheSystemLogsAtLevel(string messagePattern, string logLevel)
    {
        // ❌ BAD: "Assume" паттерн
        // Simplified: Assume logging works if DB state is correct
        // Real logging verification would capture console output
        Console.WriteLine($"[BadSteps] Verifying log message: '{messagePattern}' at {logLevel} level");
        Console.WriteLine($"[BadSteps] ✅ Log message '{messagePattern}' verified");
    }
}
