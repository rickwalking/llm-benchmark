@US-2
Feature: Add books and members
  As a librarian
  I want to add books and members to the system
  So that the catalog and membership can grow

  @AC-2.1
  Scenario: Create a new book
    When the librarian creates a book with title "Neuromancer", author "William Gibson", ISBN "978-0441569595", and 4 copies
    Then the response status is 201
    And the response includes the book with title "Neuromancer"

  @AC-2.2
  Scenario: Create a book with duplicate ISBN
    Given a book exists with ISBN "978-0441569595"
    When the librarian creates a book with ISBN "978-0441569595"
    Then the response status is 409
    And the response contains error "ISBN already exists"

  @AC-2.3
  Scenario: Create a new member
    When the librarian creates a member with name "Alice Smith" and email "alice@example.com"
    Then the response status is 201
    And the response includes the member with email "alice@example.com"

  @AC-2.4
  Scenario: Create a member with duplicate email
    Given a member exists with email "alice@example.com"
    When the librarian creates a member with email "alice@example.com"
    Then the response status is 409