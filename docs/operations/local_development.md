# Local Development Guide

## Prerequisites

- **Node.js**: v20+ (LTS recommended)
- **npm**: v10+
- **Supabase Account**: For API keys and database.

## Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/JoelA510/PlanterPlan-Alpha.git
   cd PlanterPlan-Alpha
   ```

2. **Install dependencies**:

   ```bash
   npm ci
   ```

3. **Set up environment variables**:
   Copy `.env.example` to `.env.local` and fill in the required Vite client
   variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   Keep server-only secrets such as `SUPABASE_SERVICE_ROLE_KEY`,
   `VAPID_PRIVATE_KEY`, `EMAIL_PROVIDER_API_KEY`, and `RESEND_FROM_ADDRESS`
   out of local client env files; configure those as Supabase function
   secrets. If either required Vite key is missing, the app renders a boot
   configuration error that lists only missing variable names, never values.

## Running the App

```bash
npm run dev
```

Runs the Vite app in development mode at [http://localhost:5173](http://localhost:5173).

## Linting & Build

We use ESLint and Prettier to maintain code quality.

- **Lint**: `npm run lint`
- **Build**: `npm run build`

## Testing

We use Vitest for unit/integration tests and Playwright BDD for E2E tests.

- **Run all unit tests**: `npm test`
- **UI Mode**: `npx vitest --ui`
- **Bootstrap local Supabase**: `npm run db:local:bootstrap`
- **Run local DB tests**: `npm run db:local:test`
- **Run E2E tests**: `npm run test:e2e`

## Testing Membership Features Locally

To test "Joined Projects" and membership roles locally without a full backend UI for inviting users:

1. **Create Users**: Use the Supabase Dashboard (or local Studio) Authentication tab to create at least two users (User A and User B).
2. **Create a Project**: Log in as User A and create a new project.
3. **Manually Add Membership**:
   - Go to the Supabase Dashboard > Table Editor > `project_members`.
   - Insert a row:
     - `project_id`: The ID of the project User A created.
     - `user_id`: The UUID of User B.
     - `role`: 'editor' or 'viewer'.
4. **Verify**:
   - Log in as User B.
   - The project should appear in the project sidebar or project switcher.
   - The role badge (e.g., "Editor") should be visible next to the project title.

## Application Architecture

- **Frontend**: React (Vite), TailwindCSS v4.
- **Backend Service**: Supabase (Postgres).
- **Edge Functions**: Used for secure logic like "Invite by Email".
  - To test Edge Functions locally, you need the **Supabase CLI** and Docker.
  - Run `npm run db:local:bootstrap` and `supabase functions serve`.
  - Otherwise, use the deployed staging project.
