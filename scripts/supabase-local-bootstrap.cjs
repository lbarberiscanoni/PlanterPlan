const { existsSync, readFileSync, readdirSync } = require('fs');
const { join, relative } = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const args = process.argv.slice(2);
const configPath = join(root, 'supabase', 'config.toml');
const migrationsDir = join(root, 'supabase', 'migrations');
const schemaSnapshotPath = join(root, 'docs', 'db', 'schema.sql');
const seedPath = join(root, 'supabase', 'seeds', '02_production_templates.sql');
const COMMAND_MAX_BUFFER = 64 * 1024 * 1024;

const forbiddenArgs = new Set(['--linked', '--db-url']);
if (args.some((arg) => forbiddenArgs.has(arg) || arg.startsWith('--db-url='))) {
  fail('Remote Supabase flags are not allowed by this local bootstrap wrapper.');
}
const allowedArgs = new Set(['--fresh']);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
if (unknownArgs.length > 0) {
  fail(`Unsupported bootstrap flag(s): ${unknownArgs.join(', ')}`);
}
const freshMode = args.includes('--fresh');
if (!freshMode) {
  fail('This local bootstrap wrapper requires explicit --fresh mode to reset and replay the local schema.');
}

function repoPath(file) {
  return relative(root, file).replace(/\\/g, '/');
}

function redact(value) {
  return String(value || '')
    .replace(/postgresql:\/\/[^\s|]+/gi, '[REDACTED_DB_URL]')
    .replace(/postgres:\/\/[^\s|]+/gi, '[REDACTED_DB_URL]')
    .replace(/(sb_publishable_[A-Za-z0-9._-]+)/g, '[REDACTED]')
    .replace(/(sb_secret_[A-Za-z0-9._-]+)/g, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[REDACTED_JWT]')
    .replace(/([A-Fa-f0-9]{32,})/g, '[REDACTED_HEX]')
    .replace(/^(\s*(Publishable|Secret|Access Key|Secret Key|anon key|service_role key)\s*\|\s*).+$/gim, '$1[REDACTED]');
}

function log(message) {
  console.log(`[bootstrap] ${message}`);
}

function fail(message, details) {
  console.error(`[bootstrap] ${message}`);
  if (details) console.error(redact(details));
  process.exit(1);
}

function executable(command) {
  return process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : command;
}

function commandInvocation(command, args) {
  if (process.platform === 'win32' && command === 'npx') {
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx', ...args] };
  }
  return { file: executable(command), args };
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.file, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: COMMAND_MAX_BUFFER,
    ...options
  });

  const stdout = redact(result.stdout);
  const stderr = redact(result.stderr);
  if (stdout.trim()) console.log(stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());

  if (result.error) fail(`Failed to start ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} exited with status ${result.status}`);
  return result;
}

function runQuiet(command, args, options = {}) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.file, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: COMMAND_MAX_BUFFER,
    ...options
  });
  if (result.error) fail(`Failed to start ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} exited with status ${result.status}`, `${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}

function ensureRepoRoot() {
  for (const required of ['package.json', 'supabase', 'docs']) {
    if (!existsSync(join(root, required))) fail(`Run this script from the repo root; missing ${required}.`);
  }
  for (const requiredFile of [configPath, schemaSnapshotPath, seedPath]) {
    if (!existsSync(requiredFile)) fail(`Required file is missing: ${repoPath(requiredFile)}`);
  }
  if (!existsSync(migrationsDir)) fail(`Required directory is missing: ${repoPath(migrationsDir)}`);
  if (getMigrationFiles().length === 0) fail(`No local Supabase migrations found in ${repoPath(migrationsDir)}.`);
}

function getMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(migrationsDir, name));
}

function getProjectId() {
  const config = readFileSync(configPath, 'utf8');
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);
  if (!match) fail(`Could not read project_id from ${repoPath(configPath)}.`);
  return match[1];
}

function findPostgresContainer() {
  const result = runQuiet('docker', ['ps', '--format', '{{.Names}}']);
  const names = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const projectId = getProjectId();
  const expected = `supabase_db_${projectId}`;
  const container = names.find((name) => name === expected);
  if (!container) fail(`Could not find the local Supabase Postgres container ${expected}.`);
  log(`Using local Postgres container: ${container}`);
  return container;
}

function psqlFile(container, file, label) {
  log(`Applying ${label}: ${repoPath(file)}`);
  const sql = readFileSync(file, 'utf8');
  const result = spawnSync('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-q',
    '-f',
    '-'
  ], {
    cwd: root,
    input: sql,
    encoding: 'utf8',
    shell: false
  });

  if (result.error) fail(`Failed to apply ${label}: ${result.error.message}`);
  if (result.stdout && result.stdout.trim()) console.log(redact(result.stdout).trimEnd());
  if (result.stderr && result.stderr.trim()) console.error(redact(result.stderr).trimEnd());
  if (result.status !== 0) fail(`Failed to apply ${label}.`, `${result.stdout || ''}\n${result.stderr || ''}`);
}

function psqlInline(container, sql, label) {
  log(`Running ${label}`);
  const result = spawnSync('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-q',
    '-f',
    '-'
  ], {
    cwd: root,
    input: sql,
    encoding: 'utf8',
    shell: false
  });

  if (result.error) fail(`Failed to run ${label}: ${result.error.message}`);
  if (result.stdout && result.stdout.trim()) console.log(redact(result.stdout).trimEnd());
  if (result.stderr && result.stderr.trim()) console.error(redact(result.stderr).trimEnd());
  if (result.status !== 0) fail(`Failed to run ${label}.`, `${result.stdout || ''}\n${result.stderr || ''}`);
}

function resetPublicSchema(container) {
  psqlInline(container, `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
ALTER SCHEMA public OWNER TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
`, 'fresh local public schema reset');
}

function psqlScalar(container, query, label) {
  const result = spawnSync('docker', [
    'exec',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-c',
    query
  ], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });

  if (result.error) fail(`Failed to run check "${label}": ${result.error.message}`);
  if (result.status !== 0) fail(`Check failed: ${label}`, `${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout.trim();
}

function boolCheck(container, label, query, expected, risk, handling) {
  const raw = psqlScalar(container, query, label);
  const value = raw === 't';
  const present = value ? 'present' : 'missing';
  const status = value === expected ? 'ok' : 'fail';
  return { label, present, risk, handling, status };
}

function valueCheck(container, label, query, expected, risk, handling) {
  const value = psqlScalar(container, query, label);
  const status = value === expected ? 'ok' : 'fail';
  return { label, present: value || 'missing', risk, handling, status };
}

function runRealityChecks(container) {
  log('Running schema reality checks');
  const checks = [
    boolCheck(container, 'public.tasks', "select to_regclass('public.tasks') is not null", true, 'Bootstrap blocker if missing', 'Apply docs/db/schema.sql locally'),
    boolCheck(container, 'public.tasks.origin', "select exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'origin')", true, 'High: template/instance boundaries depend on origin', 'Schema reconciliation later if missing'),
    boolCheck(container, 'public.tasks.template', "select exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'template')", false, 'Info: legacy seed column should not be required', 'Keep schema unchanged in this pass'),
    boolCheck(container, 'public.task_comments', "select to_regclass('public.task_comments') is not null", true, 'Medium: comments feature fails if missing', 'Schema reconciliation later if missing'),
    boolCheck(container, 'public.task_comments_pkey', "select exists(select 1 from pg_constraint where conname = 'task_comments_pkey' and conrelid = 'public.task_comments'::regclass and contype = 'p')", true, 'High: threaded comment self-FK requires keyed id', 'Minimal replay patch'),
    boolCheck(container, 'public.ics_feed_tokens', "select to_regclass('public.ics_feed_tokens') is not null", true, 'High: app/edge ICS paths fail if missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.users_public', "select to_regclass('public.users_public') is not null", true, 'High: notification edge functions fail if missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_set_user_admin_role', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_set_user_admin_role')", true, 'High: admin role mutation RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_analytics_snapshot', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_analytics_snapshot')", true, 'High: admin analytics RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_list_users', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_list_users')", true, 'High: admin users RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_search_users', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_search_users')", true, 'High: admin search RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_user_detail', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_user_detail')", true, 'High: admin detail RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.admin_recent_activity', "select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_recent_activity')", true, 'High: admin activity RPC missing', 'Schema reconciliation later'),
    boolCheck(container, 'public.tasks_with_primary_resource', "select to_regclass('public.tasks_with_primary_resource') is not null", true, 'Medium: project resource joins fail if missing', 'Schema reconciliation later'),
    valueCheck(container, 'public.activity_log.project_id nullable', "select coalesce((select lower(is_nullable) from information_schema.columns where table_schema = 'public' and table_name = 'activity_log' and column_name = 'project_id'), 'missing')", 'yes', 'High: admin audit events require nullable project_id', 'Schema reconciliation later'),
    boolCheck(container, 'public.activity_log primary key', "select exists(select 1 from pg_constraint where conrelid = 'public.activity_log'::regclass and contype = 'p')", true, 'Medium: audit rows need keyed identity', 'Do not patch in this pass')
  ];

  console.log('');
  console.log('Schema reality checks:');
  console.log('Object/check | Present or missing | Risk | Remediation handling | Status');
  console.log('--- | --- | --- | --- | ---');
  checks.forEach((check) => {
    console.log(`${check.label} | ${check.present} | ${check.risk} | ${check.handling} | ${check.status}`);
  });
  console.log('');

  const failures = checks.filter((check) => check.status !== 'ok');
  if (failures.length > 0) {
    fail(`Schema reality checks failed: ${failures.map((check) => `${check.label}=${check.present}`).join(', ')}`);
  }
}

ensureRepoRoot();
run('npx', ['--no-install', 'supabase', 'start']);
const container = findPostgresContainer();
log('Fresh mode enabled; resetting local public schema before schema apply.');
resetPublicSchema(container);
const migrationFiles = getMigrationFiles();
log(`Applying ${migrationFiles.length} local migration file(s).`);
migrationFiles.forEach((migrationFile) => {
  psqlFile(container, migrationFile, `migration ${repoPath(migrationFile)}`);
});
psqlFile(container, seedPath, 'seed');

const seedCount = psqlScalar(
  container,
  "select count(distinct settings->>'seed_key') from public.tasks where origin = 'template' and settings->>'published' = 'true' and settings->>'seed_key' in ('launch_large', 'multisite')",
  'template seed roots present'
);
if (seedCount !== '2') {
  fail(`Expected required production template seed keys launch_large and multisite, found ${seedCount}.`);
}

runRealityChecks(container);
log('Local Supabase bootstrap completed.');
