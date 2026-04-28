Feature: US-6 — Collect fines
  As a librarian I want to collect fines so that members can settle their balances
  and resume borrowing.

  Background:
    Given the library has the following members:
      | name  |
      | Alice |
    And the library has the following books:
      | title | author     | copies |
      | Dune  | F. Herbert | 1      |

  @AC-6.1
  Scenario: A member’s profile sums their unpaid fines
    Given "Alice" has unpaid fines totaling $7.50
    When the librarian opens "Alice"’s profile
    Then the request succeeds with status 200
    And "Alice" has 1 unpaid fines totaling $7.50

  @AC-6.2
  Scenario: Paying a fine marks it paid
    Given "Alice" has unpaid fines totaling $1.00
    When "Alice" pays the fine
    Then the request succeeds with status 200
    And "Alice" now has 0 unpaid fines

  @AC-6.3 @negative
  Scenario: Paying an already-paid fine is rejected
    Given "Alice" has unpaid fines totaling $1.00
    When "Alice" pays the fine
    Then the request succeeds with status 200
    When the librarian pays the same fine again
    Then the request fails with status 409
    And the response error message is "Fine already paid"
