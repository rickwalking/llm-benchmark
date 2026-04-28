@US-4
Feature: Record returns and fines
  As a librarian
  I want to record book returns and calculate late fines
  So that books are returned to circulation and penalties are applied

  Background:
    Given the following books exist:
      | title    | author        | isbn           | total_copies |
      | Dune     | Frank Herbert | 978-0441172719 | 2            |
    And a member "Alice" with email "alice@example.com" exists

  @AC-4.1
  Scenario: Return a book on time
    Given the member "Alice" has borrowed "Dune"
    When the librarian returns the loan for "Dune"
    Then the response status is 200
    And the loan is marked as returned
    And the book "Dune" has 2 available copies

  @AC-4.2
  Scenario Outline: Return a book late creates a fine
    Given the member "Alice" has borrowed "Dune" with due date <days_late> days ago
    When the librarian returns the loan for "Dune"
    Then the member "Alice" has a fine of <expected_fine_cents> cents

    Examples:
      | days_late | expected_fine_cents |
      | 0         | 0                   |
      | 1         | 50                  |
      | 10        | 500                 |
      | 20        | 1000                |
      | 21        | 1000                |

  @AC-4.3
  Scenario: Return an already-returned loan
    Given the member "Alice" has borrowed and returned "Dune"
    When the librarian returns the loan for "Dune" again
    Then the response status is 409
    And the response contains error "Loan already returned"

  @AC-4.4
  Scenario: Return triggers reservation notification
    Given all copies of "Dune" are on loan
    And the member "Alice" is waiting in the reservation queue for "Dune"
    When one copy of "Dune" is returned
    Then the reservation for "Alice" transitions to "notified"
    And the reservation has an expiry 48 hours from now

  @AC-4.5
  Scenario: Member profile shows active loans and fines
    Given the member "Alice" has borrowed "Dune"
    When the librarian views the profile for "Alice"
    Then the profile shows the active loan for "Dune"
    And the profile shows the due date