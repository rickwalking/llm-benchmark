Feature: Returns and fines
  As a librarian
  I want to record returns and fines
  So that overdue books are penalized

  Background:
    Given the following books exist:
      | title      | author        | isbn            | copies |
      | Dune       | Frank Herbert | 978-0441172719 | 2      |
      | Foundation | Isaac Asimov  | 978-0553293357 | 3      |
    And the following members exist:
      | name          | email              |
      | Alice Johnson | alice@example.com  |
      | Bob Smith     | bob@example.com    |

  @AC-4.1
  Scenario: Return a book on time
    Given Alice Johnson has borrowed "Dune"
    When Alice Johnson returns the loan
    Then the response status is 200
    And the loan is marked as returned
    And "Dune" has 2 available copies

  @AC-4.2
  Scenario: Return a book late creates a fine
    Given Alice Johnson has borrowed "Dune"
    And the loan is 3 days overdue
    When Alice Johnson returns the loan
    Then a fine of $1.50 is created for the loan

  @AC-4.3
  Scenario: Reject returning an already returned loan
    Given Alice Johnson has borrowed "Dune"
    And Alice Johnson has already returned the loan
    When Alice Johnson tries to return the same loan again
    Then the response status is 409
    And the error message is "Loan already returned"

  @AC-4.4
  Scenario: Return notifies next waiting reservation
    Given Alice Johnson has borrowed "Dune"
    And Bob Smith has reserved "Dune"
    When Alice Johnson returns the loan
    Then Bob Smith's reservation status becomes "notified"
    And "Dune" has 1 available copies after return
