Feature: Command Palette

  Background:
    Given the user is logged in
    And the user is on the dashboard

  Scenario: Cmd+K opens command palette
    When the user presses Cmd+K
    Then the command palette is visible

  Scenario: Palette shows Suggestions group
    When the command palette is open
    Then the "Suggestions" section is visible
    And items "Project Dashboard", "My Tasks", and "Settings" are listed

  Scenario: Palette shows Projects group
    When the command palette is open
    Then the "Projects" section is visible

  Scenario: Palette shows Actions group
    When the command palette is open
    Then the "Actions" section is visible

  Scenario: Typing filters results
    When the command palette is open
    And the user types "Settings"
    Then only matching items are shown

  Scenario: Selecting item navigates to destination
    When the command palette is open
    And the user selects "Settings"
    Then the user is redirected to "/settings"

  Scenario: "No results found" shown for unmatched query
    When the command palette is open
    And the user types "zzz_nonexistent"
    Then "No results found" is displayed

  Scenario: Escape closes palette
    When the command palette is open
    And the user presses Escape
    Then the command palette is closed
