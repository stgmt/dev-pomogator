Feature: Steps Validation Hook
  As a developer using BDD
  I want step definitions to be automatically validated
  So that I don't have empty or low-quality tests

  Background:
    Given dev-pomogator is installed with hooks

  @feature1
  Scenario: Automatic language detection - TypeScript
    Given a project with "tests/steps/example.steps.ts" file
    When the validation hook runs
    Then the language should be detected as "typescript"

  @feature2
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

  @feature3
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

  @feature4
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

  @feature5
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

  @feature5
  Scenario: Detect GOOD Then step with assertion
    Given a TypeScript project with step definition:
      """
      Then('result is correct', async function() {
        expect(this.result).toBe(42);
      });
      """
    When the validation hook analyzes the step
    Then the step should be marked as "GOOD"

  @feature5
  Scenario: Given step without assertion is acceptable
    Given a TypeScript project with step definition:
      """
      Given('fresh environment', async function() {
        this.tempDir = await createTempDir();
      });
      """
    When the validation hook analyzes the step
    Then the step should be marked as "GOOD"

  @feature6
  Scenario: Generate validation report
    Given a project with mixed quality steps
    When the validation hook runs
    Then file "steps-validation-report.md" should exist
    And the report should contain "Summary" section
    And the report should contain "BAD Steps" section

  @feature7
  Scenario: Print warnings to stdout
    Given a project with 2 BAD steps
    When the validation hook runs
    Then stdout should contain "Found 2 bad step"
    And stdout should contain "steps-validation-report.md"

  @feature8
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

  @feature9
  Scenario: Opt-out via config
    Given a project with step definitions
    And ".steps-validator.yaml" with "enabled: false"
    When the validation hook runs
    Then validation should be skipped
    And no report should be generated

  @feature9
  Scenario: Auto-activation when steps exist
    Given a project with "tests/steps/example.steps.ts"
    And no ".steps-validator.yaml" file
    When the validation hook runs
    Then validation should run automatically

  @feature10
  Scenario: Graceful error handling
    Given a project with malformed step file
    When the validation hook runs
    Then the hook should exit with code 0
    And error should be logged to "~/.dev-pomogator/logs/steps-validator.log"
    And other files should still be validated

  @feature10
  Scenario: No step definitions found
    Given a project without any step definition files
    When the validation hook runs
    Then the hook should exit with code 0
    And no report should be generated
    And no warnings should be printed

  # ── Fixture-based scenarios migrated from steps-validator.test.ts ──────────

  @feature1
  Scenario: Detect C# language from real fixture
    Given the C# fixture directory
    When language detection runs on the fixture
    Then the detected language should be "csharp"

  @feature1
  Scenario: Detect TypeScript language from real fixture
    Given the TypeScript fixture directory
    When language detection runs on the fixture
    Then the detected language should be "typescript"

  @feature1
  Scenario: Detect Python language from real fixture
    Given the Python fixture directory
    When language detection runs on the fixture
    Then the detected language should be "python"

  @feature4
  Scenario: Parse C# fixture - finds step files and parses steps
    Given the C# fixture directory
    When the fixture is parsed by the steps-validator
    Then at least 2 C# step files should be found
    And the total step count should be greater than 0
    And the parsed language should be "csharp"

  @feature2
  Scenario: Parse TypeScript fixture - finds step files and parses steps
    Given the TypeScript fixture directory
    When the fixture is parsed by the steps-validator
    Then at least 2 TypeScript step files should be found
    And the total step count should be greater than 0
    And the parsed language should be "typescript"

  @feature3
  Scenario: Parse Python fixture - finds step files and parses steps
    Given the Python fixture directory
    When the fixture is parsed by the steps-validator
    Then at least 2 Python step files should be found
    And the total step count should be greater than 0
    And the parsed language should be "python"

  @feature5
  Scenario Outline: C# GOOD step patterns on real fixture
    Given the C# fixture directory
    When the fixture is analyzed by the steps-validator
    Then the step matching "<pattern-substring>" should have status "GOOD"

    Examples:
      | pattern-substring              |
      | the result is not null         |
      | the operation succeeds         |
      | the data is valid              |
      | the element is visible         |
      | the result contains (\d        |
      | the result is not empty        |
      | the token exists               |
      | the data is validated:         |

  @feature5
  Scenario Outline: C# BAD step patterns on real fixture
    Given the C# fixture directory
    When the fixture is analyzed by the steps-validator
    Then the step matching "<pattern-substring>" should have status "BAD"

    Examples:
      | pattern-substring              |
      | the result is verified         |
      | the operation completes        |
      | the data is processed          |
      | the feature works              |
      | the validation passes          |
      | the system responds            |
      | the log is written             |
      | the API is called              |
      | the cache is updated           |
      | all items have type            |
      | all items are updated          |
      | missing IDs are skipped        |
      | the API returns token          |
      | the system logs                |

  @feature5
  Scenario: TypeScript fixture has GOOD Then steps
    Given the TypeScript fixture directory
    When the fixture is analyzed by the steps-validator
    Then at least 1 step with status "GOOD" should exist
    And at least 1 step with status "BAD" should exist

  @feature5
  Scenario: Python fixture has GOOD Then steps
    Given the Python fixture directory
    When the fixture is analyzed by the steps-validator
    Then at least 1 step with status "GOOD" should exist
    And at least 1 step with status "BAD" should exist

  @feature5
  Scenario: Python pass body is detected as BAD
    Given the Python fixture directory
    When the fixture is analyzed by the steps-validator
    Then the step matching "the operation completes" should have status "BAD"

  @feature5
  Scenario: Summary counts are internally consistent
    Given the C# fixture directory
    When the fixture is analyzed by the steps-validator
    Then the sum of good plus warning plus bad should equal totalSteps

  @feature8
  Scenario: Default config is enabled with step paths defined
    Given a project without any step definition files
    When the default config is loaded for the project
    Then the config enabled field should be true
    And the config should have step paths for typescript
    And the config should have step paths for python
    And the config should have step paths for csharp

  @feature8
  Scenario: User config merges with defaults preserving custom assertions
    Given a project with a custom ".steps-validator.yaml" config:
      """
      enabled: false
      custom_assertions:
        csharp:
          - MyAssert\.
      """
    When the default config is loaded for the project
    Then the config enabled field should be false
    And the csharp custom assertions should contain "MyAssert\."
    And the config should still have default step paths for typescript

  @feature6
  Scenario: CLI validates C# fixture and reports exact bad step count
    Given the C# fixture directory
    When the CLI runs on the C# fixture directory
    Then the CLI should exit with code 0
    And the CLI stdout should contain "Found 14 bad step(s)"

  @feature6
  Scenario: CLI validates TypeScript fixture and reports exact bad step count
    Given the TypeScript fixture directory
    When the CLI runs on the TypeScript fixture directory
    Then the CLI should exit with code 0
    And the CLI stdout should contain "Found 6 bad step(s)"
