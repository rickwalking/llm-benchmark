@US-1
Feature: View the catalog
  As a librarian
  I want to see the catalog of books
  So that I can view availability and book details

  Background:
    Given the following books exist:
      | title          | author           | isbn              | total_copies |
      | Dune           | Frank Herbert    | 978-0441172719    | 3            |
      | 1984           | George Orwell    | 978-0452284234    | 2            |

  @AC-1.1
  Scenario: List all books sorted by title
    When the librarian requests the book list
    Then the response status is 200
    And the books are sorted by title case-insensitively
    And each book includes title, author, ISBN, total_copies, and available_copies

  @AC-1.2
  Scenario: Get a single book with reservation queue depth
    Given a member "Alice" with email "alice@example.com" exists
    And a member reserves the book "Dune"
    When the librarian requests the detail for book "Dune"
    Then the response status is 200
    And the book includes reservation_queue_depth of 1

  @AC-1.4
  Scenario: Request a non-existent book
    When the librarian requests the detail for a non-existent book ID
    Then the response status is 404
    And the response contains error "Book not found"