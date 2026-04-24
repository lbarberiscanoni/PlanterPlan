Feature: Onboarding Wizard

  Background:
    Given the user is logged in

  Scenario: Wizard appears for new user with no projects
    Given the user has no projects
    When the user navigates to the dashboard
    Then the onboarding wizard is visible

  Scenario: Step 1 - enter church name
    Given the onboarding wizard is open
    When the user enters church name "Hope City Church"
    Then the Next button is enabled

  Scenario: Step 1 - Next button disabled when name is empty
    Given the onboarding wizard is open
    Then the Next button is disabled

  Scenario: Step 2 - pick launch date via calendar
    Given the user is on onboarding step 2
    When the user opens the date picker
    And the user selects a future date
    Then the selected date is displayed

  Scenario: Step 2 - skip date selection
    Given the user is on onboarding step 2
    When the user clicks Next without selecting a date
    Then the user advances to step 3

  Scenario: Step 2 - Back button returns to step 1 preserving name
    Given the user is on onboarding step 2
    When the user clicks Back in the onboarding wizard
    Then the user is on step 1
    And the church name field still contains the previously entered name

  Scenario: Step 3 - select Launch Large template (default)
    Given the user is on onboarding step 3
    Then the "Launch Large" template is selected by default

  Scenario: Step 3 - select Simple / House Church template
    Given the user is on onboarding step 3
    When the user selects the "Simple" template option
    Then the "Simple" template is selected

  Scenario: Step 3 - Create Project button submits and creates project
    Given the user is on onboarding step 3
    When the user clicks Create Project
    Then the project is created successfully
    And the user is on the project detail page

  Scenario: Loading spinner shows during project creation
    Given the user is on onboarding step 3
    When the user clicks Create Project
    Then a loading spinner is visible

  Scenario: Wizard can be dismissed via Skip button on step 1
    Given the onboarding wizard is open
    When the user clicks Skip
    Then the onboarding wizard is closed

  Scenario: Wizard can be dismissed via X close button
    Given the onboarding wizard is open
    When the user clicks the close button
    Then the onboarding wizard is closed

  Scenario: Wizard does not appear when projects already exist
    Given the user has existing projects
    When the user navigates to the dashboard
    Then the onboarding wizard is not visible
