Feature: Specs Generator Slug — analyze-features fixture

  A non-domain-coded feature whose slug (the filename stem) contains
  "specs-generator", so the -FeatureSlug specs-generator filter returns exactly
  one candidate. Carries no domain prefix, so it does NOT match -DomainCode PLUGIN.

  Background:
    Given the analyze-features corpus is loaded

  Scenario: specs-generator slug is discoverable
    Given a feature whose slug contains specs-generator
    When the agent filters candidates by that slug
    Then this feature is returned as a candidate
