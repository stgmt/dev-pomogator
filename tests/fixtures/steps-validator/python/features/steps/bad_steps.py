"""
Bad step definitions without proper assertions.
Used for testing the steps validator.
"""
from behave import given, when, then

result = None


@given("a bad setup")
def step_given_bad_setup(context):
    # TODO: implement later
    pass


@when("bad action happens")
def step_when_bad_action(context):
    print("Doing something...")


# ❌ BAD: Only print, no assertion!
@then("the result is verified")
def step_then_result_verified(context):
    print("[BadSteps] ✅ Result verified")
    print("[BadSteps] All good!")


# ❌ BAD: Only pass
@then("the operation completes")
def step_then_operation_completes(context):
    pass


# ❌ BAD: Only return
@then("the data is processed")
def step_then_data_processed(context):
    return


# ❌ BAD: NotImplementedError
@then("the validation passes")
def step_then_validation_passes(context):
    raise NotImplementedError()


# ⚠️ WARNING: TODO comment
@then("the feature works")
def step_then_feature_works(context):
    # TODO: add proper assertion
    print("Feature working...")


# ⚠️ WARNING: print only in Then
@then("the log is written")
def step_then_log_written(context):
    print("[BadSteps] Log written")
