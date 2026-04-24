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
   'CREATE INDEX "idx_tasks_cloned_from_task_id"',
  ].forEach((needle) => {
   expect(schema).toContain(needle);
  });
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

 it('keeps tasks_with_primary_resource joined to task_resources with Wave 36 columns', () => {
  const viewStart = schema.indexOf('CREATE OR REPLACE VIEW "public"."tasks_with_primary_resource" AS');
  const viewEnd = schema.indexOf('CREATE OR REPLACE VIEW "public"."view_master_library" AS');
  const viewSql = schema.slice(viewStart, viewEnd);

  expect(viewStart).toBeGreaterThanOrEqual(0);
  expect(viewEnd).toBeGreaterThan(viewStart);
  expect(viewSql).toContain('LEFT JOIN "public"."task_resources"');
 expect(viewSql).toContain('"t"."template_version"');
 expect(viewSql).toContain('"t"."cloned_from_task_id"');
 expect(viewSql).not.toContain('NULL::"uuid" AS "resource_id"');
 });

 it('keeps public views as caller-RLS security invoker views', () => {
  expect(schema).toContain('ALTER VIEW "public"."tasks_with_primary_resource" SET ("security_invoker"=\'true\');');
  expect(schema).toContain('ALTER VIEW "public"."view_master_library" SET ("security_invoker"=\'true\');');
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
