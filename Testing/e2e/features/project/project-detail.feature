Feature: Project Detail View

  Background:
    Given the user is logged in
    And the user is on a project page

  Scenario: Project page loads with header showing title and status badge
    Then the project title is visible
    And a status badge is displayed

  Scenario: Project header shows location, launch date, and team count
    Then the project metadata section shows location
    And the project metadata section shows launch date
    And the project metadata section shows team count

  Scenario: Project header shows progress bar with percentage
    Then a progress bar is visible
    And the progress percentage is displayed

  Scenario: Project header shows team member avatars
    Then team member avatar icons are visible

  Scenario: Back button navigates to tasks
    When the user clicks the back button
    Then the user is redirected to "/tasks"

  Scenario: Project loading state shows spinner
    When the project data is loading
    Then a loading spinner is visible

  Scenario: Phase cards are displayed sorted by position
    Then phase cards are visible
    And phase cards are sorted by position

  Scenario: Clicking a phase card selects it and shows its milestones
    When the user clicks phase card 1
    Then phase card 1 is selected
    And milestones for that phase are displayed

  Scenario: Active phase title and description displayed
    When the user clicks a phase card
    Then the phase title is displayed above the milestones

  Scenario: Empty milestones message when phase has none
    When the user selects a phase with no milestones
    Then an empty milestones message is shown
