Feature: US-1 Catalog visibility
  Background:
    Given the catalog contains books
      | title   | author         | isbn          | copies |
      | zeta    | Test Author    | 1000000000001 | 1      |
      | Alpha   | Test Author    | 1000000000002 | 2      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |
      | Bob   | bob@example.com   |

  @AC-1.1
  Scenario: The catalog is sorted case-insensitively
    When the librarian lists the catalog
    Then the catalog titles are "Alpha, zeta"

  @AC-1.2
  Scenario: A book detail includes queue depth
    Given Alice reserves "Alpha"
    And Bob reserves "Alpha"
    When the librarian views "Alpha"
    Then the queue depth is 2

  @AC-1.3
  Scenario: Catalog availability reflects current loans
    Given Alice has borrowed "Alpha"
    When the librarian lists the catalog
    Then "Alpha" shows 1 available copy

  @AC-1.4
  Scenario: Missing books return a clear not found error
    When the librarian views a missing book
    Then the response status is 404
    And the error is "Book not found"
