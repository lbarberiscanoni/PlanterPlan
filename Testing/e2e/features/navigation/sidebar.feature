Feature: Sidebar Navigation

  Background:
    Given the user is logged in
    And the user is on the dashboard

  Scenario: Sidebar shows My Projects section with instance projects
    Then the "My Projects" section is visible in the sidebar

  Scenario: Sidebar shows Joined Projects section
    Then the "Joined" section is visible in the sidebar

  Scenario: Sidebar shows Templates section
    Then the "Templates" section is visible in the sidebar

  Scenario: Clicking project navigates to project page
    When the user clicks a project in the sidebar
    Then the user is navigated to that project's page

  Scenario: Selected project is highlighted
    When the user is on a project page
    Then that project is highlighted in the sidebar

  Scenario: New Project button opens project creation from tasks
    When the user clicks the sidebar "New Project" button
    Then the user is navigated to the tasks creation action

  Scenario: New Template button opens template creation from tasks
    When the user clicks the sidebar "New Template" button
    Then the user is navigated to the tasks template action

  Scenario: Load more pagination for projects list
    Given there are more projects than the initial page size
    When the user clicks "Load More"
    Then additional projects are shown

  Scenario: Per-section loading states
    When the sidebar sections are loading
    Then each section shows its own loading indicator

  Scenario: Sidebar collapses on mobile
    Given the viewport is mobile size
    Then the sidebar is hidden by default

  Scenario: Mobile overlay closes sidebar when clicked
    Given the viewport is mobile size
    And the sidebar is open on mobile
    When the user clicks the overlay
    Then the sidebar closes
