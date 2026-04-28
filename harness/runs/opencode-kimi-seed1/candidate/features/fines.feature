Feature: Fine Management
  As a librarian
  I want to collect fines from members
  So that the library receives payment for late returns

  Background:
    Given the library has members with fines

  @AC-6.1
  Scenario: View member's unpaid fines
    When the librarian views a member's profile
    Then the unpaid fines total is included in the response

  @AC-6.2
  Scenario: Pay a fine
    Given a member has an unpaid fine
    When the librarian records payment for the fine
    Then the fine is marked as paid
    And the paid timestamp is set

  @AC-6.3
  Scenario: Reject payment of already paid fine
    Given a fine has already been paid
    When the librarian tries to pay the fine again
    Then the system returns a 409 error
    And the error message is "Fine already paid"
