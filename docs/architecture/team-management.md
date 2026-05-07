# docs/architecture/team-management.md

## Domain Overview
The Team Management domain handles project-specific collaboration, including the invitation system, member roster, role mutation, and granular task assignment.

## Core Entities & Data Models
* **Project Invitation:**
  * **Fields:** `Invitee Email`, `Project ID`, `Role`, `Status` (Pending, Accepted, Rejected).
* **Project Member:** Link entity mapping an `App User` to a `Project` and tracking their specific `Project Role`.

## State Machines / Lifecycles
### Member Lifecycle
1. **Pending:** Owner invites a user via email. Supabase Edge Function (`invite-by-email`) dispatches the invite.
2. **Active:** User accepts. Project appears in their project sidebar and switcher.
3. **Mutation:** Project Owner adjusts the user's role mid-project.
4. **Removal:** Project Owner explicitly removes the user from the roster.

## Business Rules & Constraints
* **Owner Exclusivity:** Only the designated `Project Owner` possesses the right to dispatch invites, mutate member roles, or prune the roster.
* **Granular Assignment:** A `Limited User` (Viewer) must be explicitly assigned as Lead to a specific Phase, Milestone, Task, or Subtask to interact with its status/fields.

## Integration Points
* **Auth / RBAC:** Works in tandem to enforce the Project Role Permission Matrix on the UI layer.
* **Supabase Edge Functions:** Executes secure email delivery outside the client.

## Known Gaps / Technical Debt
* Escrowing permissions/invites for emails that do not yet have an active Supabase App User account requires extensive flow testing to ensure seamless onboarding once the user eventually signs up.
