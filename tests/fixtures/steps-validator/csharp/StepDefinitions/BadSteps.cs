using Reqnroll;

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
}
