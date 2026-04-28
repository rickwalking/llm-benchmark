Feature: Collecting fines
  As a librarian
  I want to collect fines
  So that late returns are penalized

  Background:
    Given the following books exist:
      | title      | author        | isbn            | copies |
      | Dune       | Frank Herbert | 978-0441172719 | 2      |
    And the following members exist:
      | name          | email              |
      | Alice Johnson | alice@example.com  |

  @AC-6.1
  Scenario: Member profile shows unpaid fines
    Given Alice Johnson has an unpaid fine of $3.50
    When the librarian requests Alice's member profile
    Then the response includes unpaid_fines_cents of 350

  @AC-6.2
  Scenario: Pay a fine
    Given Alice Johnson has an unpaid fine of $3.50
    When the librarian pays the fine
    Then the response status is 200
    And the fine is marked as paid

  @AC-6.3
  Scenario: Cannot pay an already paid fine
    Given Alice Johnson has a fine that is already paid
    When the librarian tries to pay that fine again
    Then the response status is 409
    And the error message is "Fine already paid"
