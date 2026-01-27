"""
Good step definitions with proper assertions.
Used for testing the steps validator.
"""
from behave import given, when, then

result = None


# ✅ GOOD: Given steps don't need assertions
@given("a valid setup")
def step_given_valid_setup(context):
    global result
    result = "setup complete"
    print("[GoodSteps] Setup complete")


# ✅ GOOD: When steps don't need assertions
@when("an action is performed")
def step_when_action_performed(context):
    global result
    result = "action done"
    print("[GoodSteps] Action performed")


# ✅ GOOD: Then with assert
@then('the result is "{expected}"')
def step_then_result_is(context, expected):
    global result
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[GoodSteps] ✅ Result verified: {result}")


# ✅ GOOD: Then with assert
@then("the result is not null")
def step_then_result_not_null(context):
    global result
    assert result is not None


# ✅ GOOD: Then with assert in
@then('the result contains "{substring}"')
def step_then_result_contains(context, substring):
    global result
    assert substring in result


# ✅ GOOD: Then with raise check
@then("the operation succeeds")
def step_then_operation_succeeds(context):
    global result
    if result is None:
        raise ValueError("Result NOT FOUND")
    print("[GoodSteps] ✅ Operation succeeded")


# ✅ GOOD: Then with assert truthiness
@then("the data is valid")
def step_then_data_valid(context):
    global result
    assert result, "Result should not be empty"
