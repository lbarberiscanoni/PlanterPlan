Feature: Profile Settings

  Background:
    Given the user is logged in
    And the user is on the Settings page

  Scenario: Settings page shows current profile data
    Then the full name field shows the current name
    And the email field shows the current email

  Scenario: Email field is disabled (read-only)
    Then the email field is disabled

  Scenario: Edit full name and save
    When the user changes full name to "E2E Test User"
    And the user clicks save
    Then a success toast appears
    And the name field shows "E2E Test User"

  Scenario: Edit avatar URL and save
    When the user enters a valid avatar URL
    And the user clicks save
    Then a success toast appears

  Scenario: Invalid avatar URL shows validation error on blur
    When the user enters an invalid avatar URL "not-a-url"
    And the user clicks outside the avatar field
    Then an avatar validation error is shown

  Scenario: Edit role and organization
    When the user enters role "Lead Planter"
    And the user enters organization "Hope City Church"
    And the user clicks save
    Then a success toast appears

  Scenario: Toggle weekly digest on and off
    When the user toggles the weekly digest switch
    Then the switch state changes

  Scenario: Save button shows loading spinner while saving
    When the user clicks save
    Then a loading spinner appears on the save button

  Scenario: Successful save shows toast notification
    When the user makes a change and saves
    Then a success toast appears

  Scenario: Settings sidebar shows Profile active
    Then the "Profile" tab is marked as active
    And the "Notifications" tab is available
    And the "Security" tab is available
    And no settings tab shows "Coming Soon"
