import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('docs/db/schema.sql', 'utf8');

const functionSql = (name: string) => {
 const functionStart = schema.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"()`);
 const functionEnd = schema.indexOf(`ALTER FUNCTION "public"."${name}"() OWNER TO "postgres";`);

 expect(functionStart).toBeGreaterThanOrEqual(0);
 expect(functionEnd).toBeGreaterThan(functionStart);

 return schema.slice(functionStart, functionEnd);
};

describe('docs/db/schema.sql source of truth', () => {
 it('contains the Wave 34, 35, and 36 database objects', () => {
  [
   'CREATE OR REPLACE FUNCTION "public"."admin_search_users"',
   'CREATE OR REPLACE FUNCTION "public"."admin_user_detail"',
   'CREATE OR REPLACE FUNCTION "public"."admin_recent_activity"',
   'CREATE OR REPLACE FUNCTION "public"."admin_list_users"',
   'CREATE OR REPLACE FUNCTION "public"."admin_analytics_snapshot"',
   'CREATE OR REPLACE FUNCTION "public"."admin_search_root_tasks"',
   'CREATE OR REPLACE FUNCTION "public"."admin_template_roots"',
   'CREATE OR REPLACE FUNCTION "public"."admin_template_clones"',
   'CREATE TABLE IF NOT EXISTS "public"."ics_feed_tokens"',
   '"template_version" integer DEFAULT 1 NOT NULL',
   '"cloned_from_task_id" "uuid"',
  'CREATE OR REPLACE TRIGGER "trg_bump_template_version"',
  'CREATE OR REPLACE FUNCTION "public"."enforce_template_scaffold_immutability"',
  'CREATE OR REPLACE TRIGGER "trg_enforce_template_scaffold_immutability"',
   'CREATE OR REPLACE FUNCTION "public"."enforce_coach_task_update_scope"',
   'CREATE OR REPLACE TRIGGER "trg_enforce_coach_task_update_scope"',
   'CREATE OR REPLACE FUNCTION "public"."enforce_task_hierarchy_depth"',
   'CREATE OR REPLACE TRIGGER "trg_enforce_task_hierarchy_depth"',
   'CREATE OR REPLACE FUNCTION "public"."enforce_task_date_envelope"',
   'CREATE OR REPLACE TRIGGER "trg_enforce_task_date_envelope"',
   'CREATE OR REPLACE FUNCTION "public"."enforce_ics_feed_token_update_scope"',
   'CREATE OR REPLACE TRIGGER "trg_enforce_ics_feed_token_update_scope"',
   'CREATE OR REPLACE FUNCTION "public"."list_task_comments_with_authors"',
   'CREATE OR REPLACE FUNCTION "public"."list_project_members_with_profiles"',
   'CREATE INDEX "idx_tasks_cloned_from_task_id"',
  ].forEach((needle) => {
   expect(schema).toContain(needle);
  });
 });

 it('keeps team member profile hydration gated in Postgres', () => {
  const rpcStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."list_project_members_with_profiles"');
  const rpcEnd = schema.indexOf('ALTER FUNCTION "public"."list_project_members_with_profiles"');
  const rpcSql = schema.slice(rpcStart, rpcEnd);

  expect(rpcStart).toBeGreaterThanOrEqual(0);
  expect(rpcEnd).toBeGreaterThan(rpcStart);
  expect(rpcSql).toContain('public.is_admin(v_actor_id)');
  expect(rpcSql).toContain('FROM public.project_members pm');
  expect(rpcSql).toContain('LEFT JOIN auth.users u ON u.id = pm.user_id');
  expect(rpcSql).toContain('unauthorized: project membership required');
  expect(schema).toContain('GRANT ALL ON FUNCTION "public"."list_project_members_with_profiles"("p_project_id" "uuid") TO "authenticated";');
  expect(schema).toContain('CREATE POLICY "members_delete_policy" ON "public"."project_members" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"');
 });

 it('keeps only the hardened timestamptz clone_project_template overload', () => {
 expect(schema).toContain('"p_start_date" timestamp with time zone');
 expect(schema).toContain('"p_due_date" timestamp with time zone');
  expect(schema).not.toMatch(/CREATE OR REPLACE FUNCTION "public"\."clone_project_template"\([^)]*"p_start_date" date/is);
  expect(schema).not.toMatch(
   /CREATE OR REPLACE FUNCTION "public"\."clone_project_template"\("p_template_id" "uuid", "p_new_parent_id" "uuid", "p_new_origin" "text", "p_user_id" "uuid"\)/is,
  );
 });

 it('keeps clone_project_template source and destination authorization separate', () => {
  const functionStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."clone_project_template"(');
  const functionEnd = schema.indexOf('ALTER FUNCTION "public"."clone_project_template"(');
  const sql = schema.slice(functionStart, functionEnd);

  expect(functionStart).toBeGreaterThanOrEqual(0);
  expect(functionEnd).toBeGreaterThan(functionStart);
  expect(sql).toContain("p_user_id <> v_actor_id");
  expect(sql).toContain("v_template_origin = 'template'");
  expect(sql).toContain('v_template_published OR v_template_creator = v_actor_id');
  expect(sql).toContain('public.has_project_role(v_new_root_id, v_actor_id, ARRAY[\'owner\', \'editor\'])');
  expect(sql).not.toContain('has_permission(v_template_root_id, (SELECT auth.uid()), \'member\')');
 });

 it('characterizes clone_project_template instance note isolation and approved settings', () => {
  const functionStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."clone_project_template"(');
  const functionEnd = schema.indexOf('ALTER FUNCTION "public"."clone_project_template"(');
  const sql = schema.slice(functionStart, functionEnd);

  expect(functionStart).toBeGreaterThanOrEqual(0);
  expect(functionEnd).toBeGreaterThan(functionStart);
  expect(sql).toContain('notes, purpose, actions, settings, is_complete, days_from_start, start_date, due_date');
  expect(sql).toContain("CASE WHEN p_new_origin = 'instance' THEN NULL::text ELSE t.notes END");
  expect(sql).toContain("'is_coaching_task'");
  expect(sql).toContain("'is_strategy_template'");
  expect(sql).toContain("'project_kind'");
  expect(sql).toContain("t.settings ->> 'project_kind' IN ('date', 'checkpoint')");
  expect(sql).toContain("'spawnedFromTemplate', p_template_id::text");
  expect(sql).toContain("'cloned_from_template_version', COALESCE(t.template_version, 1)");
 });

 it('keeps cloned scaffold immutability enforced below the UI', () => {
  const sql = functionSql('enforce_template_scaffold_immutability');

  expect(sql).toContain("OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL");
  expect(sql).toContain('protected template scaffold tasks cannot be deleted');
  expect(sql).toContain('protected template scaffold fields cannot be changed');
  expect(sql).toContain('protected template scaffold settings cannot be changed');
  expect(sql).toContain("auth.role() = 'service_role'");
  expect(sql).toContain("'is_coaching_task'");
  expect(sql).toContain("'spawnedFromTemplate'");
  expect(sql).toContain("'cloned_from_template_version'");
  expect(sql).not.toContain('supervisor_email IS DISTINCT');
 });

 it('keeps coach task updates scoped to progress fields below the UI', () => {
  const sql = functionSql('enforce_coach_task_update_scope');

  expect(sql).toContain("public.has_project_role(v_project_id, v_actor_id, ARRAY['coach'])");
  expect(sql).toContain("OLD.origin = 'instance'");
  expect(sql).toContain("COALESCE(\n            (COALESCE(OLD.settings, '{}'::jsonb) -> 'is_coaching_task') = 'true'::jsonb,\n            false\n        )");
  expect(sql).toContain("'is_coaching_task'");
  expect(sql).toContain('coach role may update only task progress fields');
  expect(sql).toContain('OLD.title IS DISTINCT FROM NEW.title');
  expect(sql).toContain('OLD.settings IS DISTINCT FROM NEW.settings');
  expect(sql).toContain('OLD.assignee_id IS DISTINCT FROM NEW.assignee_id');
  expect(sql).toContain("COALESCE(NEW.status, '') NOT IN");
  expect(schema).toContain('WITH CHECK (("public"."has_project_role"(COALESCE("root_id", "id"), ( SELECT "auth"."uid"() AS "uid"), ARRAY[\'coach\'::"text"])');
  expect(schema).toContain('COMMENT ON POLICY "Enable update for coaches on coaching tasks"');
 });

 it('keeps task hierarchy depth enforced below the UI', () => {
  const deriveStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."derive_task_type"(');
  const deriveEnd = schema.indexOf('ALTER FUNCTION "public"."derive_task_type"(');
  const deriveSql = schema.slice(deriveStart, deriveEnd);
  const guardSql = functionSql('enforce_task_hierarchy_depth');

  expect(deriveStart).toBeGreaterThanOrEqual(0);
  expect(deriveEnd).toBeGreaterThan(deriveStart);
  expect(deriveSql).toContain("RETURN 'subtask'");
  expect(guardSql).toContain('task hierarchy depth exceeded: subtasks cannot have child tasks');
  expect(guardSql).toContain('task hierarchy cannot parent a task under its own descendant');
  expect(guardSql).toContain('v_new_depth + v_descendant_height > 4');
  expect(schema).toContain(
   'CREATE OR REPLACE TRIGGER "trg_enforce_task_hierarchy_depth" BEFORE INSERT OR UPDATE OF "parent_task_id"',
  );
 });

 it('keeps task date envelopes enforced below the UI', () => {
  const guardSql = functionSql('enforce_task_date_envelope');

  expect(guardSql).toContain('due date cannot be before start date');
  expect(guardSql).toContain('task dates must stay within parent task dates');
  expect(guardSql).toContain('existing child task dates are outside parent task dates');
  expect(guardSql).toContain("auth.role() = 'service_role'");
  expect(guardSql).toContain('AND v_new_start > v_parent_due');
  expect(guardSql).toContain('AND v_new_due < v_parent_start');
  expect(guardSql).toContain("(child.start_date AT TIME ZONE 'UTC')::date < v_new_start");
  expect(guardSql).toContain("(child.due_date AT TIME ZONE 'UTC')::date < v_new_start");
  expect(guardSql).toContain("(child.start_date AT TIME ZONE 'UTC')::date > v_new_due");
  expect(guardSql).toContain("(child.due_date AT TIME ZONE 'UTC')::date > v_new_due");
  expect(schema).toContain(
   'CREATE OR REPLACE TRIGGER "trg_enforce_task_date_envelope" BEFORE INSERT OR UPDATE OF "parent_task_id", "start_date", "due_date"',
  );
 });

 it('keeps task reads scoped to every project member role', () => {
  const selectPolicyStart = schema.indexOf('CREATE POLICY "Enable read access for all users" ON "public"."tasks" FOR SELECT');
  const selectPolicyEnd = schema.indexOf('CREATE POLICY "Enable update for coaches on coaching tasks"', selectPolicyStart);
  const selectPolicySql = schema.slice(selectPolicyStart, selectPolicyEnd);

  expect(selectPolicyStart).toBeGreaterThanOrEqual(0);
  expect(selectPolicyEnd).toBeGreaterThan(selectPolicyStart);
  expect(selectPolicySql).toContain('"public"."has_project_role"(COALESCE("root_id", "id")');
  for (const role of ['owner', 'editor', 'coach', 'viewer', 'limited']) {
   expect(selectPolicySql).toContain(`'${role}'::"text"`);
  }
  expect(selectPolicySql).toContain('"public"."is_admin"');
 });

 it('keeps ICS token revocation one-way below the UI', () => {
  const sql = functionSql('enforce_ics_feed_token_update_scope');

  expect(sql).toContain('OLD.token IS DISTINCT FROM NEW.token');
  expect(sql).toContain('OLD.project_filter IS DISTINCT FROM NEW.project_filter');
  expect(sql).toContain('OLD.last_accessed_at IS DISTINCT FROM NEW.last_accessed_at');
  expect(sql).toContain('revoked ICS feed tokens cannot be reactivated or changed');
  expect(sql).toContain('ICS feed token update must revoke the token');
  expect(sql).toContain("auth.role() = 'service_role'");
  expect(schema).toContain(
   'CREATE POLICY "Admins can delete ICS tokens" ON "public"."ics_feed_tokens" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));',
  );
 expect(schema).not.toContain('CREATE POLICY "Users can delete their own ICS tokens"');
 });

 it('keeps comment author hydration and mention payloads explicit', () => {
  const rpcStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."list_task_comments_with_authors"');
  const rpcEnd = schema.indexOf('ALTER FUNCTION "public"."list_task_comments_with_authors"');
  const rpcSql = schema.slice(rpcStart, rpcEnd);
  const triggerSql = functionSql('enqueue_comment_mentions');

  expect(rpcStart).toBeGreaterThanOrEqual(0);
  expect(rpcEnd).toBeGreaterThan(rpcStart);
  expect(rpcSql).toContain('public.is_active_member(v_root_id, v_actor_id)');
  expect(rpcSql).toContain('public.is_admin(v_actor_id)');
  expect(rpcSql).toContain('LEFT JOIN auth.users AS u ON u.id = c.author_id');
  expect(rpcSql).toContain("'user_metadata', COALESCE(u.raw_user_meta_data, '{}'::jsonb)");
  expect(triggerSql).toContain('enqueue_comment_mentions ignored % non-uuid mention value(s)');
  expect(triggerSql).toContain("'recipient_id', v_user_id");
  expect(triggerSql).toContain("'actor_id', NEW.author_id");
  expect(triggerSql).toContain("'project_id', NEW.root_id");
 });

 it('keeps initialize_default_project available for blank project scaffolding', () => {
  const functionStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."initialize_default_project"(');
  const functionEnd = schema.indexOf('ALTER FUNCTION "public"."initialize_default_project"(');
  const sql = schema.slice(functionStart, functionEnd);

  expect(functionStart).toBeGreaterThanOrEqual(0);
  expect(functionEnd).toBeGreaterThan(functionStart);
  expect(sql).toContain('IF auth.uid() <> p_creator_id THEN');
  expect(sql).toContain('INSERT INTO public.project_members (project_id, user_id, role)');
  expect(sql).toContain("'Discovery'");
  expect(sql).toContain("'Growth'");
  expect(sql).toContain("'tasks_created', v_task_count");
 });

 it('keeps tasks_with_primary_resource joined to task_resources with Wave 36 columns', () => {
  const viewStart = schema.indexOf('CREATE OR REPLACE VIEW "public"."tasks_with_primary_resource"');
  const viewEnd = schema.indexOf('CREATE OR REPLACE VIEW "public"."users_public"');
  const viewSql = schema.slice(viewStart, viewEnd);

  expect(viewStart).toBeGreaterThanOrEqual(0);
  expect(viewEnd).toBeGreaterThan(viewStart);
  expect(viewSql).toContain('LEFT JOIN "public"."task_resources"');
 expect(viewSql).toContain('"t"."template_version"');
 expect(viewSql).toContain('"t"."cloned_from_task_id"');
 expect(viewSql).not.toContain('NULL::"uuid" AS "resource_id"');
 });

 it('keeps public views as caller-RLS security invoker views', () => {
  expect(schema).toContain('CREATE OR REPLACE VIEW "public"."tasks_with_primary_resource" WITH ("security_invoker"=\'true\') AS');
  expect(schema).toContain('CREATE OR REPLACE VIEW "public"."view_master_library" WITH ("security_invoker"=\'true\') AS');
 });

 it('keeps root task rows stamped with their own root_id', () => {
  const sql = functionSql('set_root_id_from_parent');

  expect(sql).toContain('SET "search_path" TO \'\'');
  expect(sql).toContain('IF NEW.parent_task_id IS NULL THEN');
  expect(sql).toContain('NEW.root_id := NEW.id;');
  expect(sql).toContain('NEW.root_id := COALESCE(v_parent_root, NEW.parent_task_id);');
 });

 it('keeps security-sweep trigger helper bodies in schema.sql', () => {
  const updatedAtSql = functionSql('handle_updated_at');
  const completionSql = functionSql('sync_task_completion_flags');

  expect(updatedAtSql).toContain('SET "search_path" TO \'\'');
  expect(completionSql).toContain('SET "search_path" TO \'\'');
  expect(completionSql).toContain("IF NEW.status = 'completed' THEN");
  expect(completionSql).toContain('NEW.is_complete := true;');
  expect(completionSql).toContain('NEW.is_complete := false;');
  expect(completionSql).not.toContain('v_complete_changed');
  expect(completionSql).not.toContain('NEW.status := CASE');
 });

 it('keeps account lifecycle user references anonymizing instead of restricting auth deletion', () => {
  expect(schema).toContain('"author_id" "uuid",');
  expect(schema).toContain(
   'ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;',
  );
  expect(schema).toContain(
   'ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;',
  );
  expect(schema).toContain(
   'ADD CONSTRAINT "tasks_creator_fkey" FOREIGN KEY ("creator") REFERENCES "auth"."users"("id") ON DELETE SET NULL;',
  );
  expect(schema).not.toContain(
   'ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;',
  );
 });

 it('keeps has_permission aligned to role ownership instead of creatorship', () => {
  const functionStart = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."has_permission"(');
  const functionEnd = schema.indexOf('ALTER FUNCTION "public"."has_permission"(');
  const sql = schema.slice(functionStart, functionEnd);

  expect(functionStart).toBeGreaterThanOrEqual(0);
  expect(functionEnd).toBeGreaterThan(functionStart);
  expect(sql).toContain('STABLE SECURITY DEFINER');
  expect(sql).toContain('v_auth_uid uuid := auth.uid();');
  expect(sql).toContain('p_user_id <> v_auth_uid');
  expect(sql).toContain('IF public.is_admin(p_user_id) THEN');
  expect(sql).toContain('RETURN public.check_project_ownership_by_role(p_project_id, p_user_id);');
  expect(sql).not.toContain('creator = p_user_id');
  expect(schema).toContain('REVOKE ALL ON FUNCTION "public"."has_permission"("p_project_id" "uuid", "p_user_id" "uuid", "p_required_role" "text") FROM PUBLIC;');
 });
});
