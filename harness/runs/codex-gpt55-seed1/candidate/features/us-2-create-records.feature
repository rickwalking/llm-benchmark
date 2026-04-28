Feature: US-2 Adding books and members
  Background:
    Given the catalog contains books
      | title | author      | isbn          | copies |
      | Dune  | Test Author | 1000000000101 | 1      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |

  @AC-2.1
  Scenario: A librarian adds a book
    When the librarian adds the book "Kindred" with ISBN "1000000000102"
    Then the response status is 201
    And the created book is "Kindred"

  @AC-2.2
  Scenario: Duplicate ISBNs are rejected
    When the librarian adds the book "Duplicate Dune" with ISBN "1000000000101"
    Then the response status is 409
    And the error is "ISBN already exists"

  @AC-2.3
  Scenario: A librarian adds a member
    When the librarian adds member "Ben" with email "ben@example.com"
    Then the response status is 201
    And the created member is "Ben"

  @AC-2.4
  Scenario: Duplicate member emails are rejected
    When the librarian adds member "Other Alice" with email "alice@example.com"
    Then the response status is 409
    And the error is "Email already exists"
