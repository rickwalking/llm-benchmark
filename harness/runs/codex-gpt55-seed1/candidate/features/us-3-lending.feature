Feature: US-3 Lending books
  Background:
    Given the catalog contains books
      | title       | author      | isbn          | copies |
      | Dune        | Test Author | 1000000000201 | 1      |
      | Spare One   | Test Author | 1000000000202 | 1      |
      | Spare Two   | Test Author | 1000000000203 | 1      |
      | Spare Three | Test Author | 1000000000204 | 1      |
      | Spare Four  | Test Author | 1000000000205 | 1      |
      | Spare Five  | Test Author | 1000000000206 | 1      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |
      | Bob   | bob@example.com   |

  @AC-3.1
  Scenario: A valid loan decreases availability
    When the librarian lends "Dune" to Alice
    Then the response status is 201
    And "Dune" shows 0 available copies

  @AC-3.2
  Scenario: Members cannot exceed five active loans
    Given Alice has borrowed five books
    When the librarian lends "Dune" to Alice
    Then the response status is 409
    And the error is "Loan limit reached"

  @AC-3.3
  Scenario: Suspended members cannot borrow
    Given Alice is suspended
    When the librarian lends "Dune" to Alice
    Then the response status is 403
    And the error is "Member is suspended"

  @AC-3.4
  Scenario: Members with excessive unpaid fines cannot borrow
    Given Alice has unpaid fines of 501 cents
    When the librarian lends "Dune" to Alice
    Then the response status is 402
    And the error is "Outstanding fines exceed limit"

  @AC-3.5
  Scenario: Unavailable books must be reserved
    Given Bob has borrowed "Dune"
    When the librarian lends "Dune" to Alice
    Then the response status is 409
    And the error is "No copies available — reserve instead"

  @AC-3.6
  Scenario: Checkout can identify a fifth active loan
    Given Alice has borrowed four books
    When the librarian views member Alice
    Then Alice has 4 active loans
