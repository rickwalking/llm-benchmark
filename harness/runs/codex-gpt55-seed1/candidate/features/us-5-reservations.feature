Feature: US-5 Reservation queue
  Background:
    Given the catalog contains books
      | title | author      | isbn          | copies |
      | Dune  | Test Author | 1000000000401 | 1      |
    And members exist
      | name  | email             |
      | Alice | alice@example.com |
      | Bob   | bob@example.com   |
      | Chen  | chen@example.com  |

  @AC-5.1
  Scenario: A member reserves a book
    When Alice reserves "Dune"
    Then the response status is 201
    And Alice's reservation for "Dune" is "waiting"

  @AC-5.2
  Scenario: Members cannot reserve books they already have on loan
    Given Alice has borrowed "Dune"
    When Alice reserves "Dune"
    Then the response status is 409
    And the error is "Member already has this book on loan"

  @AC-5.3
  Scenario: Duplicate active reservations are rejected
    Given Alice reserves "Dune"
    When Alice reserves "Dune"
    Then the response status is 409
    And the error is "Duplicate reservation"

  @AC-5.4
  Scenario: A notified reservation can be fulfilled by checkout
    Given Alice has borrowed "Dune"
    And Bob reserves "Dune"
    And the librarian returns Alice's loan for "Dune"
    When the librarian lends "Dune" to Bob
    Then the response status is 201
    And Bob's reservation for "Dune" is "fulfilled"

  @AC-5.5
  Scenario: Stale notifications expire and the next member is notified
    Given Alice has borrowed "Dune"
    And Bob reserves "Dune"
    And Chen reserves "Dune"
    And the librarian returns Alice's loan for "Dune"
    And Bob's notification for "Dune" is stale
    When stale reservations are expired
    Then Bob's reservation for "Dune" is "expired"
    And Chen's reservation for "Dune" is "notified"

  @AC-5.6
  Scenario: Book detail shows a member queue position
    Given Alice reserves "Dune"
    And Bob reserves "Dune"
    When the librarian views "Dune" for Bob
    Then Bob's queue position is 2
