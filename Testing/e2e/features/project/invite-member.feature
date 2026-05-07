Feature: Invite Member

  Background:
    Given the user is logged in

  Scenario: Invite button visible for owners
    Given the user is a project owner
    And the user is on a project page
    Then the invite button is visible

  Scenario: Invite button hidden for viewers
    Given the user is a project viewer
    And the user is on a project page
    Then the invite button is not visible

  Scenario: Invite member modal opens
    Given the user is on a project page
    When the user clicks the invite button
    Then the invite member modal is visible

  Scenario: Enter email and select role
    Given the invite member modal is open
    When the user enters invite email "editor@example.com"
    And the user selects role "Editor"
    Then the email field contains "editor@example.com"

  Scenario: Successful invite shows success message
    Given the invite member modal is open
    When the user sends a valid invite
    Then a success message is displayed in the modal

  Scenario: Invite with invalid email or UUID shows error
    Given the invite member modal is open
    When the user enters invite email "invalid-format"
    And the user submits the invite
    Then an error message is displayed in the modal

  Scenario: Invite with empty field is prevented
    Given the invite member modal is open
    When the user submits the invite without entering an email
    Then the submit button is disabled or an error is shown

  Scenario: Modal auto-closes after successful invite
    Given the invite member modal is open
    When the user sends a valid invite
    Then the modal closes automatically after success

  Scenario: Cancel button closes modal
    Given the invite member modal is open
    When the user clicks cancel
    Then the invite member modal is closed
