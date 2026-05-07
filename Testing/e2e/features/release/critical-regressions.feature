@release
Feature: Release critical regression coverage
  Release gates should exercise real workflows and trusted data boundaries, not
  only route smoke tests.

  Scenario: Completion cascade, rollups, phase unlock, and write guardrails
    Given a release regression project tree exists
    When the signed-in release user opens the team roster route
    Then the team roster route shows the project member profile
    When the user completes a parent task with an open subtask through the UI
    Then the parent, child, rollup, and dependent phase states are persisted correctly
    When invalid release hierarchy and date-envelope writes are attempted through Supabase
    Then both invalid writes are rejected without changing persisted task state

  Scenario: Role-denied and admin-denied paths remain enforced
    Given a release regression project tree exists
    And release regression coach and viewer members exist
    When they attempt release regression role-forbidden task updates through Supabase
    Then the coach and viewer writes are rejected while coaching progress remains allowed
    When the signed-in release user opens the admin route
    Then the admin route denies access and returns to the task dashboard

  Scenario: Mentions and calendar token lifecycle remain reliable
    Given a release regression project tree exists
    And a release regression mentioned member exists
    When the release regression member is mentioned in a task comment
    Then the member receives a populated mention notification
    When the user creates, revokes, and rotates release ICS tokens
    Then revoked release ICS tokens are inactive and hidden from other users
