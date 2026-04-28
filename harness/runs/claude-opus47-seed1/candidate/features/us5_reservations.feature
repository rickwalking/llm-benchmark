Feature: US-5 — Reserve unavailable books
  When a book is unavailable, members can join a reservation queue and be
  notified when a copy returns.

  Background:
    Given the library has the following members:
      | name    |
      | Alice   |
      | Bob     |
      | Carol   |
    And the library has the following books:
      | title | author     | copies |
      | Dune  | F. Herbert | 1      |

  @AC-5.1
  Scenario: Joining the reservation queue
    Given "Bob" borrowed "Dune"
    When "Alice" reserves "Dune"
    Then the request succeeds with status 201
    And the reservation queue depth for "Dune" is 1

  @AC-5.2 @negative
  Scenario: Cannot reserve a book the member already has on loan
    Given "Alice" borrowed "Dune"
    When "Alice" tries to reserve "Dune"
    Then the request fails with status 409
    And the response error message is "Member already has this book on loan"

  @AC-5.3 @negative
  Scenario: Cannot reserve the same book twice
    Given "Bob" borrowed "Dune"
    And "Alice" reserved "Dune"
    When "Alice" tries to reserve "Dune"
    Then the request fails with status 409
    And the response error message is "Duplicate reservation"

  @AC-5.4
  Scenario: The notified reservation holder gets to borrow
    Given "Bob" borrowed "Dune"
    And "Alice" reserved "Dune"
    When the librarian returns "Dune" from "Bob"
    Then the request succeeds with status 200
    When the librarian lends "Dune" to "Alice"
    Then the request succeeds with status 201
    And "Alice"’s reservation for "Dune" is in status "fulfilled"

  @AC-5.4 @negative
  Scenario: A non-priority member cannot jump the notified hold
    Given "Bob" borrowed "Dune"
    And "Alice" reserved "Dune"
    When the librarian returns "Dune" from "Bob"
    Then the request succeeds with status 200
    When the librarian tries to lend "Dune" to "Carol"
    Then the request fails with status 409
    And the response error message is "Book is reserved for another member"

  @AC-5.5
  Scenario: An unclaimed notification expires and the next-in-queue is notified
    Given "Bob" borrowed "Dune"
    And "Alice" reserved "Dune"
    And "Carol" reserved "Dune"
    When the librarian returns "Dune" from "Bob"
    Then the request succeeds with status 200
    When the reservation notification window passes
    Then the request succeeds with status 200
    And "Alice"’s reservation for "Dune" is in status "expired"
    And "Carol"’s reservation for "Dune" is in status "notified"
