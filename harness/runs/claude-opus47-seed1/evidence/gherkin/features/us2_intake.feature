Feature: US-2 — Add books and members
  As a librarian I want to add new books and register new members so that
  the catalog and member roll stay current.

  @AC-2.1
  Scenario: Adding a new book succeeds
    When the librarian adds a book "Solaris" by "Stanislaw Lem" with ISBN "978-0-156-02760-7" and 2 copies
    Then the request succeeds with status 201
    And the book "Solaris" is in the catalog

  @AC-2.2 @negative
  Scenario: Adding a book with a duplicate ISBN is rejected
    Given the library has the following books:
      | title    | author        | copies |
      | Existing | Some Author   | 1      |
    When the librarian adds a book "Different Title" by "Other" with ISBN "9783161484100" and 1 copies
    Then the request succeeds with status 201
    When the librarian adds a book "Another Title" by "Other" with ISBN "9783161484100" and 1 copies
    Then the request fails with status 409
    And the response error message is "ISBN already exists"

  @AC-2.3
  Scenario: Adding a member with a valid email succeeds
    When the librarian adds a member "Casey Lin" with email "casey@example.org"
    Then the request succeeds with status 201

  @AC-2.4 @negative
  Scenario: Adding a member with a duplicate email is rejected
    When the librarian adds a member "First Person" with email "shared@example.org"
    Then the request succeeds with status 201
    When the librarian adds a member "Second Person" with email "shared@example.org"
    Then the request fails with status 409
    And the response error message is "Email already exists"
