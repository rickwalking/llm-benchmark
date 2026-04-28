Feature: Catalog browsing
  As a librarian
  I want to see the catalog
  So that I can check book availability

  Background:
    Given the following books exist:
      | title              | author            | isbn            | copies |
      | Dune               | Frank Herbert     | 978-0441172719 | 4      |
      | Foundation          | Isaac Asimov      | 978-0553293357 | 3      |
      | Neuromancer         | William Gibson    | 978-0441569595 | 2      |
    And the following members exist:
      | name          | email              |
      | Alice Johnson | alice@example.com  |

  @AC-1.1
  Scenario: List all books sorted by title
    When the librarian requests the book catalog
    Then the response status is 200
    And the response contains 3 books
    And the books are sorted by title alphabetically

  @AC-1.2
  Scenario: Get a single book with queue depth
    When the librarian requests the book "Dune"
    Then the response status is 200
    And the book has a queue_depth field
    And the book has 4 available copies

  @AC-1.4
  Scenario: Get a non-existent book returns 404
    When the librarian requests the book with id "00000000-0000-0000-0000-000000000000"
    Then the response status is 404
    And the error message is "Book not found"

  @AC-1.1-ready
  Scenario: Available copies count with active loans
    Given Alice Johnson has borrowed "Dune"
    When the librarian requests the book catalog
    Then the book "Dune" shows 3 available of 4 copies
