Feature: US-1 — View the catalog
  As a librarian I want to see the catalog so that I can locate books.

  Background:
    Given the library has the following books:
      | title           | author        | copies |
      | Dune            | Frank Herbert | 3      |
      | foundation      | Isaac Asimov  | 4      |
      | a wizard        | Le Guin       | 2      |

  @AC-1.1
  Scenario: Listing all books returns titles, authors, ISBN, totals and availability sorted by title
    When the librarian fetches the catalog
    Then the request succeeds with status 200
    And the catalog is sorted by title case-insensitively

  @AC-1.2
  Scenario: A book detail includes its reservation queue depth
    Given a member named "Alice"
    And a member named "Bob"
    Given "Alice" borrowed "Dune"
    And "Alice" borrowed "Dune"
    And "Alice" borrowed "Dune"
    And "Bob" reserved "Dune"
    When the librarian fetches book "Dune"
    Then the request succeeds with status 200
    And the reservation queue depth for "Dune" is 1

  @AC-1.4 @negative
  Scenario: Looking up an unknown book returns 404
    When the librarian fetches a non-existent book
    Then the request fails with status 404
    And the response error message is "Book not found"
