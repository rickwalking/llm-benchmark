@US-5
Feature: Reserve unavailable books
  As a librarian
  I want members to reserve unavailable books
  So that they are notified when copies become available

  Background:
    Given the following books exist:
      | title    | author        | isbn           | total_copies |
      | Dune     | Frank Herbert | 978-0441172719 | 1            |
    And a member "Alice" with email "alice@example.com" exists
    And a member "Bob" with email "bob@example.com" exists

  @AC-5.1
  Scenario: Create a reservation for an unavailable book
    Given all copies of "Dune" are on loan
    When the librarian reserves "Dune" for "Alice"
    Then the response status is 201
    And the reservation status is "waiting"

  @AC-5.2
  Scenario: Cannot reserve a book already on loan by the member
    Given the member "Alice" has borrowed "Dune"
    When the librarian reserves "Dune" for "Alice"
    Then the response status is 409
    And the response contains error "Member already has this book on loan"

  @AC-5.3
  Scenario: Cannot create a duplicate reservation
    Given all copies of "Dune" are on loan
    And the member "Alice" has a waiting reservation for "Dune"
    When the librarian reserves "Dune" for "Alice"
    Then the response status is 409
    And the response contains error "Duplicate reservation"

  @AC-5.5
  Scenario: Expire stale reservations
    Given all copies of "Dune" are on loan
    And the member "Alice" has a notified reservation for "Dune" that expired 1 hour ago
    And the member "Bob" has a waiting reservation for "Dune"
    When the system expires stale reservations
    Then the reservation for "Alice" is "expired"
    And the reservation for "Bob" transitions to "notified"