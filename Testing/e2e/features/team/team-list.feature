Feature: Team List

  Background:
    Given the user is logged in
    And the user is on the Team page for a project

  Scenario: Team page shows project team title with project name
    Then the page title includes the project name

  Scenario: Team member cards show name, role badge, and email
    Given the project has team members
    Then member cards are visible
    And each card shows a name, role badge, and email

  Scenario: Empty state shows "Build your team" message
    Given the project has no team members
    Then the "Build your team" empty state is visible

  Scenario: Loading spinner during fetch
    When the team data is loading
    Then a loading spinner is visible
