Feature: Adding books and members
  As a librarian
  I want to add books and members
  So that the library catalog stays up to date

  @AC-2.1
  Scenario: Create a new book
    When the librarian creates a book with title "The Hobbit", author "J.R.R. Tolkien", ISBN "978-0547928227", and 4 copies
    Then the response status is 201
    And the book title is "The Hobbit"

  @AC-2.2
  Scenario: Reject duplicate ISBN
    Given a book with ISBN "978-0441172719" already exists
    When the librarian creates a book with ISBN "978-0441172719"
    Then the response status is 409
    And the error message is "ISBN already exists"

  @AC-2.3
  Scenario: Create a new member
    When the librarian creates a member with name "Bob Smith" and email "bob@example.com"
    Then the response status is 201
    And the member name is "Bob Smith"

  @AC-2.4
  Scenario: Reject duplicate member email
    Given a member with email "carol@example.com" already exists
    When the librarian creates a member with name "Carol Dup" and email "carol@example.com"
    Then the response status is 409
    And the error message is "Email already exists"
