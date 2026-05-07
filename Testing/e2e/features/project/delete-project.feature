Feature: Delete Project

  Background:
    Given the user is logged in
    And the edit project modal is open

  Scenario: Delete button in danger zone of edit modal
    Then the delete button is visible in the danger zone section

  Scenario: First click shows "Are you sure?" confirmation
    When the user clicks the delete button
    Then a confirmation prompt appears

  Scenario: Cancel confirmation hides confirmation buttons
    When the user clicks the delete button
    And the confirmation prompt is visible
    And the user cancels the deletion
    Then the confirmation prompt is hidden

  Scenario: Confirm delete removes project and redirects to tasks
    When the user clicks the delete button
    And the user confirms the deletion
    Then the user is redirected to "/tasks"
    And the project is no longer in the sidebar
