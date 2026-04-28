Feature: Book Catalog Management
  As a librarian
  I want to view and manage the book catalog
  So that I can help members find and borrow books

  Background:
    Given the library has books in the catalog

  @AC-1.1
  Scenario: List all books in the catalog
    When the librarian requests the book catalog
    Then the system returns a list of all books
    And each book shows title, author, ISBN, total copies, and available copies
    And the list is sorted by title

  @AC-1.2
  Scenario: Get detailed book information
    When the librarian views a specific book
    Then the system returns the book details
    And includes the current reservation queue depth

  @AC-1.4
  Scenario: Request non-existent book
    When the librarian requests a book that does not exist
    Then the system returns a 404 error
    And the error message is "Book not found"
