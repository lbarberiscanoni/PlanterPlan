Feature: Empty and Error States

  Background:
    Given the user is logged in

  Scenario: Dashboard - no projects empty state with CTA
    Given the user has no projects
    When the user is on the dashboard
    Then a "Create Your First Project" CTA is visible

  Scenario: My Tasks - no tasks empty state message
    Given the user has no tasks
    When the user is on the My Tasks page
    Then a "No tasks" empty state is visible

  Scenario: Team - no members empty state with "Add First Member" CTA
    Given the project has no members
    When the user is on the Team page
    Then a "Build your team" CTA is visible

  Scenario: Reports - no project selected shows selector prompt
    When the user is on the Reports page without a project
    Then a "Select a Project" prompt is visible

  Scenario: My Tasks - all caught up empty state
    Given there are no tasks due today
    When the user is on the My Tasks page
    Then the "All caught up" message is visible

  Scenario: Phase with no milestones shows empty message
    Given a phase has no milestones
    When the user selects that phase
    Then an empty milestones message is shown

  Scenario: Dashboard error state with retry button
    Given the dashboard data fails to load
    Then an error state with a retry button is visible

  Scenario: Loading spinners on all data-fetching pages
    When any page is loading data
    Then a loading spinner is visible
