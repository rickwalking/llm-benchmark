Feature: US-3 — Lend a book to a member
  As a librarian I want to record a lend so that the borrower has a tracked loan
  and the catalog shows the right availability.

  Background:
    Given the library has the following members:
      | name    |
      | Alice   |
      | Bob     |
    And the library has the following books:
      | title         | author       | copies |
      | Dune          | F. Herbert   | 1      |
      | Foundation    | I. Asimov    | 1      |
      | Neuromancer   | W. Gibson    | 1      |

  @AC-3.1
  Scenario: A successful checkout creates an active loan with a 14-day due date
    When the librarian lends "Dune" to "Alice"
    Then the request succeeds with status 201
    And the loan due date is 14 days from today
    And the available copies of "Dune" is 0
    And "Alice" now has 1 active loans

  @AC-3.2 @negative
  Scenario: A 6th simultaneous loan is rejected
    Given "Alice" has 5 active loans
    When the librarian tries to lend "Dune" to "Alice"
    Then the request fails with status 409
    And the response error message is "Loan limit reached"

  @AC-3.3 @negative
  Scenario: A suspended member cannot borrow
    Given "Alice" is suspended
    When the librarian tries to lend "Dune" to "Alice"
    Then the request fails with status 403
    And the response error message is "Member is suspended"

  @AC-3.4 @negative
  Scenario: A member with too many unpaid fines is blocked
    Given "Alice" has unpaid fines totaling $5.01
    When the librarian tries to lend "Dune" to "Alice"
    Then the request fails with status 402
    And the response error message is "Outstanding fines exceed limit"

  @AC-3.4
  Scenario: A member with fines at exactly the threshold is allowed
    Given "Alice" has unpaid fines totaling $5.00
    When the librarian lends "Dune" to "Alice"
    Then the request succeeds with status 201

  @AC-3.5 @negative
  Scenario: With no copies available the system suggests a reservation
    Given "Bob" borrowed "Dune"
    When the librarian tries to lend "Dune" to "Alice"
    Then the request fails with status 409
    And the response error message is "No copies available — reserve instead"

  @AC-3.6
  Scenario: A 5th loan returns a warning to surface in the UI
    Given "Alice" has 4 active loans
    When the librarian lends "Dune" to "Alice"
    Then the request succeeds with status 201
    And the response includes a warning containing "5th"
