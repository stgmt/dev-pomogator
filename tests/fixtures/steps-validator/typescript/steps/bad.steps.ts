import { Given, When, Then } from "@cucumber/cucumber";

let result: string;

Given("a bad setup", async function () {
  // TODO: implement later
});

When("bad action happens", async function () {
  console.log("Doing something...");
});

// ❌ BAD: Only console.log, no assertion!
Then("the result is verified", async function () {
  console.log("[BadSteps] ✅ Result verified");
  console.log("[BadSteps] All good!");
});

// ❌ BAD: Empty body
Then("the operation completes", async function () {});

// ❌ BAD: Only return
Then("the data is processed", async function () {
  return;
});

// ❌ BAD: Pending error
Then("the validation passes", async function () {
  throw new Error("Pending: not implemented");
});

// ⚠️ WARNING: TODO comment
Then("the feature works", async function () {
  // TODO: add proper assertion
  console.log("Feature working...");
});

// ⚠️ WARNING: console.log only in Then
Then("the log is written", async function () {
  console.log("[BadSteps] Log written");
});
