Feature: Lending Books
  As a librarian
  I want to lend books to members
  So that they can borrow and read them

  Background:
    Given the library has books and members

  @AC-3.1
  Scenario: Successfully lend a book to a member
    Given a member "Alice" with ID "m1" is active
    And a book "The Hobbit" with ID "b1" has available copies
    When the librarian lends the book to the member
    Then the system creates a loan
    And sets the due date to 14 days from now
    And decreases the available copies by 1

  @AC-3.2
  Scenario: Reject loan when member has reached loan limit
    Given a member "Alice" with ID "m1" has 5 active loans
    When the librarian tries to lend another book to the member
    Then the system returns a 409 error
    And the error message is "Loan limit reached"

  @AC-3.3
  Scenario: Reject loan for suspended member
    Given a member "David" with ID "m4" is suspended
    When the librarian tries to lend a book to the suspended member
    Then the system returns a 403 error
    And the error message is "Member is suspended"

  @AC-3.4
  Scenario: Reject loan when member has outstanding fines exceeding limit
    Given a member "Alice" with ID "m1" has unpaid fines totaling $6.00
    When the librarian tries to lend a book to the member
    Then the system returns a 402 error
    And the error message is "Outstanding fines exceed limit"

  @AC-3.5
  Scenario: Reject loan when no copies available
    Given a book "1984" with ID "b3" has 0 available copies
    And the member does not have a notified reservation for this book
    When the librarian tries to lend the book to a member
    Then the system returns a 409 error
    And the error message is "No copies available — reserve instead"
