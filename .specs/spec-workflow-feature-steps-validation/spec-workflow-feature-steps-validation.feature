Feature: Steps Validation Hook
  As a developer using BDD
  I want step definitions to be automatically validated
  So that I don't have empty or low-quality tests

  Background:
    Given dev-pomogator is installed with hooks

  # @feature1
  Scenario: Automatic language detection - TypeScript
    Given a project with "tests/steps/example.steps.ts" file
    When the validation hook runs
    Then the language should be detected as "typescript"

  # @feature2
  Scenario: Parse TypeScript step definitions
    Given a TypeScript project with step definitions:
      """
      Given('user exists', async function() {
        this.user = await createUser();
      });
      
      Then('user is authenticated', async function() {
        expect(this.user.isAuth).toBe(true);
      });
      """
    When the validation hook parses the file
    Then 2 step definitions should be found
    And step "user exists" should be type "Given"
    And step "user is authenticated" should be type "Then"

  # @feature3
  Scenario: Parse Python step definitions
    Given a Python project with step definitions:
      """
      @given('user exists')
      def step_user_exists(context):
          context.user = create_user()
      
      @then('user is authenticated')
      def step_user_auth(context):
          assert context.user.is_auth
      """
    When the validation hook parses the file
    Then 2 step definitions should be found

  # @feature4
  Scenario: Parse C# step definitions
    Given a C# project with step definitions:
      """
      [Given(@"user exists")]
      public void GivenUserExists()
      {
          _context["user"] = CreateUser();
      }
      
      [Then(@"user is authenticated")]
      public void ThenUserIsAuthenticated()
      {
          _context.Get<User>("user").IsAuth.Should().BeTrue();
      }
      """
    When the validation hook parses the file
    Then 2 step definitions should be found

  # @feature5
  Scenario: Detect BAD Then step without assertion
    Given a TypeScript project with step definition:
      """
      Then('result is displayed', async function() {
        console.log(this.result);
      });
      """
    When the validation hook analyzes the step
    Then the step should be marked as "BAD"
    And the issue should be "Only logging, no assertion"

  # @feature5
  Scenario: Detect GOOD Then step with assertion
    Given a TypeScript project with step definition:
      """
      Then('result is correct', async function() {
        expect(this.result).toBe(42);
      });
      """
    When the validation hook analyzes the step
    Then the step should be marked as "GOOD"

  # @feature5
  Scenario: Given step without assertion is acceptable
    Given a TypeScript project with step definition:
      """
      Given('fresh environment', async function() {
        this.tempDir = await createTempDir();
      });
      """
    When the validation hook analyzes the step
    Then the step should be marked as "GOOD"

  # @feature6
  Scenario: Generate validation report
    Given a project with mixed quality steps
    When the validation hook runs
    Then file "steps-validation-report.md" should exist
    And the report should contain "Summary" section
    And the report should contain "BAD Steps" section

  # @feature7
  Scenario: Print warnings to stdout
    Given a project with 2 BAD steps
    When the validation hook runs
    Then stdout should contain "Found 2 bad steps"
    And stdout should contain "steps-validation-report.md"

  # @feature8
  Scenario: Configuration via YAML
    Given a project with ".steps-validator.yaml":
      """
      enabled: true
      on_bad_steps: warn
      ignore:
        - "**/legacy/**"
      """
    And a file "tests/legacy/old.steps.ts" with BAD steps
    And a file "tests/steps/new.steps.ts" with BAD steps
    When the validation hook runs
    Then "old.steps.ts" should not be in the report
    And "new.steps.ts" should be in the report

  # @feature9
  Scenario: Opt-out via config
    Given a project with step definitions
    And ".steps-validator.yaml" with "enabled: false"
    When the validation hook runs
    Then validation should be skipped
    And no report should be generated

  # @feature9
  Scenario: Auto-activation when steps exist
    Given a project with "tests/steps/example.steps.ts"
    And no ".steps-validator.yaml" file
    When the validation hook runs
    Then validation should run automatically

  # @feature10
  Scenario: Graceful error handling
    Given a project with malformed step file
    When the validation hook runs
    Then the hook should exit with code 0
    And error should be logged to "~/.dev-pomogator/logs/steps-validator.log"
    And other files should still be validated

  # @feature10
  Scenario: No step definitions found
    Given a project without any step definition files
    When the validation hook runs
    Then the hook should exit with code 0
    And no report should be generated
    And no warnings should be printed
