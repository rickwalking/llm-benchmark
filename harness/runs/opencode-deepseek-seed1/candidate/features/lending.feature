Feature: Lending books
  As a librarian
  I want to lend a book to a member
  So that members can borrow library materials

  Background:
    Given the following books exist:
      | title      | author        | isbn            | copies |
      | Dune       | Frank Herbert | 978-0441172719 | 1      |
      | Foundation | Isaac Asimov  | 978-0553293357 | 3      |
    And the following members exist:
      | name          | email              |
      | Alice Johnson | alice@example.com  |
      | Bob Smith     | bob@example.com    |

  @AC-3.1
  Scenario: Successfully borrow a book
    When Alice Johnson borrows "Dune"
    Then the response status is 201
    And the loan has a due_date
    And "Dune" has 0 available copies

  @AC-3.2
  Scenario: Reject borrowing more than 5 books
    Given Alice Johnson has 5 active loans
    When Alice Johnson tries to borrow another book
    Then the response status is 409
    And the error message is "Loan limit reached"

  @AC-3.3
  Scenario: Reject borrowing when member is suspended
    Given a member "Eve" with status "suspended"
    When Eve tries to borrow "Dune"
    Then the response status is 403
    And the error message is "Member is suspended"

  @AC-3.4
  Scenario: Reject borrowing when outstanding fines exceed $5
    Given Alice Johnson has unpaid fines of $5.01
    When Alice Johnson tries to borrow "Foundation"
    Then the response status is 402
    And the error message is "Outstanding fines exceed limit"

  @AC-3.5
  Scenario: Reject borrowing when no copies available
    Given Alice Johnson has borrowed "Dune"
    When Bob Smith tries to borrow "Dune"
    Then the response status is 409
    And the error message is "No copies available — reserve instead"
