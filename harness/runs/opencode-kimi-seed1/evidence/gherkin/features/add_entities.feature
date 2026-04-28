Feature: Adding Books and Members
  As a librarian
  I want to add new books and members to the system
  So that they can participate in the library

  Background:
    Given the library system is operational

  @AC-2.1
  Scenario: Add a new book to the catalog
    When the librarian adds a book with title "Dune", author "Frank Herbert", ISBN "978-0441013593", and 3 copies
    Then the system creates the book
    And returns the created book with a generated ID

  @AC-2.2
  Scenario: Add a book with duplicate ISBN
    Given a book exists with ISBN "978-0441013593"
    When the librarian adds a book with the same ISBN
    Then the system returns a 409 error
    And the error message is "ISBN already exists"

  @AC-2.3
  Scenario: Add a new member
    When the librarian adds a member with name "John Doe" and email "john@example.com"
    Then the system creates the member
    And the member status is "active"

  @AC-2.4
  Scenario: Add a member with duplicate email
    Given a member exists with email "john@example.com"
    When the librarian adds a member with the same email
    Then the system returns a 409 error
    And the error message is "Email already exists"
