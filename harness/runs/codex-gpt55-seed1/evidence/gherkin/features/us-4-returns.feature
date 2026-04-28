Feature: US-4 Returns and fines
  Background:
    Given the catalog contains books
      | title | author      | isbn          | copies |
      | Dune  | Test Author | 1000000000301 | 1      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |
      | Bob   | bob@example.com   |

  @AC-4.1
  Scenario: Returning a loan restores availability
    Given Alice has borrowed "Dune"
    When the librarian returns Alice's loan for "Dune"
    Then the response status is 200
    And "Dune" shows 1 available copy

  @AC-4.2
  Scenario: Returning late creates a fine
    Given Alice has borrowed "Dune"
    And Alice's loan for "Dune" is 3 days overdue
    When the librarian returns Alice's loan for "Dune"
    Then Alice's unpaid fine total is 150 cents

  @AC-4.3
  Scenario: Returned loans cannot be returned again
    Given Alice has borrowed "Dune"
    And the librarian returns Alice's loan for "Dune"
    When the librarian returns Alice's loan for "Dune"
    Then the response status is 409
    And the error is "Loan already returned"

  @AC-4.4
  Scenario: Returning a reserved book notifies the head of the queue
    Given Alice has borrowed "Dune"
    And Bob reserves "Dune"
    When the librarian returns Alice's loan for "Dune"
    Then Bob's reservation for "Dune" is "notified"
    And "Dune" shows 0 available copies

  @AC-4.5
  Scenario: Member profiles include loans, reservations, and fines
    Given Alice has borrowed "Dune"
    When the librarian views member Alice
    Then Alice has 1 active loan
