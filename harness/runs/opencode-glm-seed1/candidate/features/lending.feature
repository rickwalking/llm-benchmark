@US-3
Feature: Lend a book to a member
  As a librarian
  I want to lend a book to a member
  So that members can borrow books from the library

  Background:
    Given the following books exist:
      | title    | author        | isbn           | total_copies |
      | Dune     | Frank Herbert | 978-0441172719 | 2            |
    And a member "Alice" with email "alice@example.com" exists

  @AC-3.1
  Scenario: Successfully borrow a book
    When the librarian lends "Dune" to "Alice"
    Then the response status is 201
    And the loan has a due date 14 days from now
    And the book "Dune" has 1 available copy

  @AC-3.2
  Scenario: Reject loan when member has 5 active loans
    Given the member "Alice" has 5 active loans
    When the librarian lends "Dune" to "Alice"
    Then the response status is 409
    And the response contains error "Loan limit reached"

  @AC-3.3
  Scenario: Reject loan when member is suspended
    Given the member "Alice" is suspended
    When the librarian lends "Dune" to "Alice"
    Then the response status is 403
    And the response contains error "Member is suspended"

  @AC-3.4
  Scenario: Reject loan when member has unpaid fines over $5
    Given the member "Alice" has unpaid fines of $6.00
    When the librarian lends "Dune" to "Alice"
    Then the response status is 402
    And the response contains error "Outstanding fines exceed limit"

  @AC-3.5
  Scenario: Reject loan when no copies available
    Given all copies of "Dune" are on loan
    When the librarian lends "Dune" to "Alice"
    Then the response status is 409
    And the response contains error "No copies available — reserve instead"

  @AC-3.5b
  Scenario: Notified member can borrow a reserved book
    Given all copies of "Dune" are on loan
    And a member "Bob" with email "bob@example.com" exists
    And the member "Alice" has a notified reservation for "Dune"
    When the librarian lends "Dune" to "Alice"
    Then the response status is 201
    And the reservation for "Alice" on "Dune" is fulfilled

  @AC-5.4
  Scenario: Non-notified member cannot borrow reserved book
    Given all copies of "Dune" are on loan
    And a member "Bob" with email "bob@example.com" exists
    And the member "Alice" has a notified reservation for "Dune"
    When the librarian lends "Dune" to "Bob"
    Then the response status is 409
    And the response contains error "Book is reserved for another member"