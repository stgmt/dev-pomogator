import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

let result: string;

// ✅ GOOD: Given steps don't need assertions
Given("a valid setup", async function () {
  result = "setup complete";
  console.log("[GoodSteps] Setup complete");
});

// ✅ GOOD: When steps don't need assertions
When("an action is performed", async function () {
  result = "action done";
  console.log("[GoodSteps] Action performed");
});

// ✅ GOOD: Then with expect assertion
Then("the result is {string}", async function (expected: string) {
  expect(result).toBe(expected);
  console.log(`[GoodSteps] ✅ Result verified: ${result}`);
});

// ✅ GOOD: Then with expect assertion
Then("the result is not null", async function () {
  expect(result).toBeDefined();
});

// ✅ GOOD: Then with expect.toContain
Then("the result contains {string}", async function (substring: string) {
  expect(result).toContain(substring);
});

// ✅ GOOD: Then with throw check
Then("the operation succeeds", async function () {
  if (!result) {
    throw new Error("Result NOT FOUND");
  }
  console.log("[GoodSteps] ✅ Operation succeeded");
});

// ✅ GOOD: Then with expect.toBeTruthy
Then("the data is valid", async function () {
  expect(result).toBeTruthy();
});
