Feature: Team Management

  Background:
    Given the user is logged in
    And the user is on the Team page for a project

  Scenario: Add Member button visible with project context
    Then the "Add Member" button is visible

  Scenario: Add member modal opens with email and role fields
    When the user clicks "Add Member"
    Then the add member modal is visible
    And the modal has email and role fields

  Scenario: Cancel button closes add member modal
    When the user clicks "Add Member"
    And the user clicks cancel
    Then the add member modal is closed

  Scenario: Remove member action is visible when permitted
    Given the project has team members
    Then remove actions are available for removable members
