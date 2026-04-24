Feature: Mobile Tasks
  As a mobile user I can see my upcoming tasks

  Background:
    Given the user is logged in
    And the user is on a mobile device

  Scenario: Mobile task list is visible
    When the user navigates to the tasks page
    Then the mobile task list is visible
    And today's tasks are listed

  Scenario: Empty state when no tasks for today
    Given the user has no tasks due today
    When the user navigates to the tasks page
    Then an empty state message is displayed

  Scenario: Completing a task from the agenda
    When the user navigates to the tasks page
    And the user marks a task as complete
    Then the task shows a completed status

  Scenario: Agenda refreshes with new tasks
    When the user navigates to the tasks page
    And a new task is assigned for today
    Then the agenda updates to show the new task
