@US-6
Feature: Collect fines
  As a librarian
  I want to collect fines from members
  So that penalties are tracked and resolved

  Background:
    Given a member "Alice" with email "alice@example.com" exists

  @AC-6.1
  Scenario: Member profile includes unpaid fines total
    Given the member "Alice" has unpaid fines of $3.50
    When the librarian views the profile for "Alice"
    Then the profile shows unpaid_fines_cents of 350

  @AC-6.2
  Scenario: Pay a fine
    Given the member "Alice" has unpaid fines of $3.50
    When the librarian pays the fine
    Then the fine is marked as paid
    And the response status is 200

  @AC-6.3
  Scenario: Pay an already-paid fine
    Given the member "Alice" has a paid fine
    When the librarian pays the fine again
    Then the response status is 409
    And the response contains error "Fine already paid"