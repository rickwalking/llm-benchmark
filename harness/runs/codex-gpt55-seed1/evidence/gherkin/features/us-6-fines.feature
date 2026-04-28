Feature: US-6 Fine collection
  Background:
    Given the catalog contains books
      | title | author      | isbn          | copies |
      | Dune  | Test Author | 1000000000501 | 1      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |

  @AC-6.1
  Scenario: Member detail sums unpaid fines
    Given Alice has unpaid fines of 250 cents
    When the librarian views member Alice
    Then Alice's unpaid fine total is 250 cents

  @AC-6.2
  Scenario: A librarian pays a fine
    Given Alice has unpaid fines of 250 cents
    When the librarian pays Alice's fine
    Then the response status is 200
    And Alice's unpaid fine total is 0 cents

  @AC-6.3
  Scenario: Already paid fines cannot be paid again
    Given Alice has unpaid fines of 250 cents
    And the librarian pays Alice's fine
    When the librarian pays Alice's fine
    Then the response status is 409
    And the error is "Fine already paid"

  @AC-6.4
  Scenario: Member profiles expose unpaid fine details
    Given Alice has unpaid fines of 250 cents
    When the librarian views member Alice
    Then Alice has 1 unpaid fine
