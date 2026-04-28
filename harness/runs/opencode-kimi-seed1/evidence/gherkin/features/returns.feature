Feature: Returns and Fines
  As a librarian
  I want to record book returns and assess fines for late returns
  So that the library inventory is accurate and late fees are collected

  Background:
    Given the library has active loans

  @AC-4.1
  Scenario: Return a book on time
    Given a member has borrowed a book
    When the librarian records the return before the due date
    Then the loan is marked as returned
    And the available copies increases by 1

  @AC-4.2
  Scenario: Return a book late and create a fine
    Given a member borrowed a book 20 days ago
    And the loan was due 6 days ago
    When the librarian records the return
    Then the loan is marked as returned
    And a fine of $3.00 is created

  @AC-4.2
  Scenario: Return a book very late with fine cap
    Given a member borrowed a book 40 days ago
    And the loan was due 26 days ago
    When the librarian records the return
    Then a fine of $10.00 is created (the maximum cap)

  @AC-4.3
  Scenario: Reject return of already returned book
    Given a loan has already been returned
    When the librarian tries to return the loan again
    Then the system returns a 409 error
    And the error message is "Loan already returned"

  @AC-4.4
  Scenario: Return creates notification for next reservation
    Given a book has a waiting reservation
    When a copy of the book is returned
    Then the oldest waiting reservation becomes notified
    And the reservation has an expiry time of 48 hours
