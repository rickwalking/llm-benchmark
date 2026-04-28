Feature: Reservations
  As a librarian
  I want members to reserve unavailable books
  So that they are notified when copies become available

  Background:
    Given the following books exist:
      | title      | author        | isbn            | copies |
      | Dune       | Frank Herbert | 978-0441172719 | 1      |
      | Foundation | Isaac Asimov  | 978-0553293357 | 3      |
    And the following members exist:
      | name          | email              |
      | Alice Johnson | alice@example.com  |
      | Bob Smith     | bob@example.com    |

  @AC-5.1
  Scenario: Reserve an unavailable book
    When Bob Smith reserves "Dune"
    Then the response status is 201
    And the reservation status is "waiting"

  @AC-5.2
  Scenario: Cannot reserve book already on loan
    Given Alice Johnson has borrowed "Dune"
    When Alice Johnson tries to reserve "Dune"
    Then the response status is 409
    And the error message is "Member already has this book on loan"

  @AC-5.3
  Scenario: Cannot have duplicate reservations
    Given Bob Smith has reserved "Dune"
    When Bob Smith tries to reserve "Dune" again
    Then the response status is 409
    And the error message is "Duplicate reservation"

  @AC-5.4
  Scenario: Notified member can borrow while others cannot
    Given Alice Johnson has borrowed "Dune"
    And Bob Smith has reserved "Dune"
    When the book is returned and Bob Smith is notified
    Then Bob Smith can borrow "Dune"
    And another member cannot borrow "Dune"

  @AC-5.5
  Scenario: Expired notifications notify next in queue
    Given Alice Johnson has borrowed "Dune"
    And Bob Smith has reserved "Dune"
    And Carol (a third member) has reserved "Dune"
    When the book is returned and Bob Smith is notified
    And Bob Smith's notification expires
    When reservations are expired
    Then Bob Smith's reservation status is "expired"
    And Carol's reservation status is "notified"
