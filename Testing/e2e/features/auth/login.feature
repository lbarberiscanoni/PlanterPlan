Feature: User Login

  Background:
    Given the user is on the login page

  @release
  Scenario: Successful login with valid credentials
    When the user enters email "test@example.com"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then the user is redirected to "/tasks"

  Scenario: Login fails with invalid email
    When the user enters email "wrong@example.com"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then an error toast with message "Login failed" appears

  Scenario: Login fails with invalid password
    When the user enters email "test@example.com"
    And the user enters password "wrongpassword"
    And the user clicks the sign in button
    Then an error toast with message "Login failed" appears

  Scenario: Login shows validation error for empty email
    When the user enters password "password123"
    And the user clicks the sign in button
    Then a validation error "Please enter a valid email address" is shown for "email"

  Scenario: Login shows validation error for empty password
    When the user enters email "test@example.com"
    And the user clicks the sign in button
    Then a validation error "Password must be at least 6 characters" is shown for "password"

  @release
  Scenario: Login shows email validation error for malformed email
    When the user enters email "notanemail"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then a validation error "Please enter a valid email address" is shown for "email"

  Scenario: Login shows password minimum length error
    When the user enters email "test@example.com"
    And the user enters password "short"
    And the user clicks the sign in button
    Then a validation error "Password must be at least 6 characters" is shown for "password"

  Scenario: Loading spinner appears during authentication
    When the user enters email "test@example.com"
    And the user enters password "password123"
    And the user clicks the sign in button
    Then a loading spinner is visible on the submit button

  Scenario: E2E auto-login button visible in E2E mode
    Then the auto-login button is visible
