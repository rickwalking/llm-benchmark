Feature: Reservations
  As a librarian
  I want members to reserve unavailable books
  So that they can borrow them when copies become available

  Background:
    Given the library has books and members

  @AC-5.1
  Scenario: Create a reservation for unavailable book
    Given a book has no available copies
    When a member creates a reservation for the book
    Then the reservation is created with status "waiting"

  @AC-5.2
  Scenario: Reject reservation when member has book on loan
    Given a member has an active loan for a book
    When the member tries to reserve the same book
    Then the system returns a 409 error
    And the error message is "Member already has this book on loan"

  @AC-5.3
  Scenario: Reject duplicate reservation
    Given a member has a waiting reservation for a book
    When the member tries to reserve the same book again
    Then the system returns a 409 error
    And the error message is "Duplicate reservation"

  @AC-5.4
  Scenario: Fulfilling a notified reservation
    Given a member has a notified reservation for a book
    When the member borrows the book
    Then the loan is created
    And the reservation status becomes "fulfilled"

  @AC-5.4
  Scenario: Block borrow when book is reserved for another member
    Given a book has a notified reservation for member "Alice"
    When another member "Bob" tries to borrow the book
    Then the system returns a 409 error
    And the error message is "Book is reserved for another member"

  @AC-5.5
  Scenario: Expire stale reservations
    Given a reservation has been in notified status for more than 48 hours
    When the expiration job runs
    Then the reservation status becomes "expired"
    And the next waiting reservation becomes notified
