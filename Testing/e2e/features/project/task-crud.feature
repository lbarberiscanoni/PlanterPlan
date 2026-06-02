Feature: Task CRUD

  Background:
    Given the user is logged in

  Scenario: Create new task via form
    Given the user is on a project page
    When the user clicks "Add Task"
    And the user fills in the task title "E2E New Task"
    And the user submits the task form
    Then the task "E2E New Task" appears in the task list
    And a success toast appears

  Scenario: Edit existing task via details panel
    Given the user is on a project page with tasks
    When the user clicks on a task
    And the user clicks the edit button
    And the user changes the task title to "Updated Task Title"
    And the user saves the task form
    Then the task title is updated to "Updated Task Title"
    And a success toast appears

  Scenario: Delete task via details panel with confirmation
    Given the user is on a project page with tasks
    When the user clicks on a task
    And the user clicks the delete button
    And the user confirms the deletion
    Then the task is removed from the list

  Scenario: Inline task creation within a milestone
    Given the user is on a project page
    When the user clicks the inline add task button in a milestone
    And the user types "Quick Task" and presses Enter
    Then the task "Quick Task" appears in the milestone

  Scenario: Task creation shows success toast
    Given the user is on a project page
    When the user creates a task "Toast Test Task"
    Then a success toast appears

  Scenario: Task update shows success toast
    Given the user is on a project page with tasks
    When the user edits a task
    Then a success toast appears

  Scenario: Task creation failure shows error toast
    When task creation fails due to server error
    Then an error toast appears

  Scenario: Status change on a task updates immediately
    Given the user is on a project page with tasks
    When the user changes a task status to "In Progress"
    Then the task status badge shows "In Progress"

  Scenario: Clone task from library search in task form
    Given the user is on a project page
    When the user opens the task creation form
    And the user searches the library for a template task
    And the user selects a library template
    Then the task form is populated with the template data
