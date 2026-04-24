Feature: Reports Display

  Background:
    Given the user is logged in
    And the user is viewing reports for a project

  Scenario: Four stats cards displayed with correct values
    Then four report stats cards are visible
    And the stats cards show Phases, Total Tasks, Completed Tasks, and Team Members

  Scenario: Overall progress card shows percentage and progress bar
    Then the overall progress section is visible
    And a progress bar with percentage is displayed

  Scenario: Task status distribution pie chart renders
    Then the task status pie chart is visible

  Scenario: Upcoming deadlines list shows milestones with dates
    Then the upcoming deadlines section is visible
    And milestone items with due dates are listed

  Scenario: "No upcoming deadlines" shown when none exist
    Given the project has no upcoming deadlines
    Then a "No upcoming deadlines" message is shown

  Scenario: Phase details section shows each phase with progress bar
    Then the phase details section is visible
    And each phase shows a progress bar

  Scenario: Phase details show completed and total milestones count
    Then each phase detail shows "X of Y" completion count

  Scenario: Back arrow links to project page
    When the user clicks the back arrow
    Then the user is navigated to the project page

  Scenario: Loading spinner while data loads
    When the reports data is loading
    Then a loading spinner is visible
