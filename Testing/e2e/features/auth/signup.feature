Feature: User Sign Up

  Background:
    Given the user is on the login page

  Scenario: Toggle between sign in and sign up modes
    Then the subtitle reads "Sign in to your account"
    When the user clicks the toggle mode button
    Then the subtitle reads "Create your account"
    And the submit button reads "Sign Up"

  @release
  Scenario: Successful sign up with valid credentials
    When the user clicks the toggle mode button
    And the user enters email "newuser@example.com"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then the user is redirected to "/tasks"

  Scenario: Sign up fails for duplicate email
    When the user clicks the toggle mode button
    And the user enters email "test@example.com"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then an error toast with message "Sign up failed" appears

  Scenario: Sign up form validates email format
    When the user clicks the toggle mode button
    And the user enters email "bademail"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then a validation error "Please enter a valid email address" is shown for "email"

  Scenario: Sign up form validates password length
    When the user clicks the toggle mode button
    And the user enters email "new@example.com"
    And the user enters password "short"
    And the user clicks the sign in button
    Then a validation error "Password must be at least 6 characters" is shown for "password"
