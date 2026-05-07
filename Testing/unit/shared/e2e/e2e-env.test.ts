import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const e2eEnvModulePath = '../../../../scripts/e2e-env.cjs';
const {
 assertSafeAnonKey,
 redactE2EEnvForLog,
 resolveE2EEnv,
} = require(e2eEnvModulePath) as {
 assertSafeAnonKey: (key: string) => string;
 redactE2EEnvForLog: (
  e2eEnv: Record<string, string | undefined>,
  sourceEnv?: Record<string, string | undefined>,
 ) => Record<string, string>;
 resolveE2EEnv: (sourceEnv?: Record<string, string | undefined>) => Record<string, string>;
};

function jwtWithRole(role: string) {
 const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
 const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
 return `${header}.${payload}.signature`;
}

describe('E2E env resolver', () => {
 it('has no noisy side effects on import', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const moduleId = require.resolve(e2eEnvModulePath);

  delete require.cache[moduleId];
  require(e2eEnvModulePath);

  expect(logSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();

  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
 });

 it('forces the local Supabase URL even when localhost is provided', () => {
  const env = resolveE2EEnv({
   VITE_SUPABASE_URL: 'http://localhost:54321',
   VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
  });

  expect(env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  expect(env.VITE_E2E_MODE).toBe('true');
 });

 it('fails closed when a remote-looking Supabase URL is present', () => {
  expect(() =>
   resolveE2EEnv({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
   }),
  ).toThrow(/non-local Supabase URL/);
 });

 it('prefers process env anon key over the local default', () => {
  const env = resolveE2EEnv({
   VITE_SUPABASE_ANON_KEY: 'sb_publishable_custom',
  });

  expect(env.VITE_SUPABASE_ANON_KEY).toBe('sb_publishable_custom');
 });

 it('rejects service-role and secret-looking keys', () => {
  expect(() => assertSafeAnonKey('sb_secret_123')).toThrow(/service-role|secret-looking/);
  expect(() => assertSafeAnonKey('contains_service_role_marker')).toThrow(/service-role|secret-looking/);
  expect(() => assertSafeAnonKey(jwtWithRole('service_role'))).toThrow(/service-role JWT/);
  expect(assertSafeAnonKey(jwtWithRole('anon'))).toBe(jwtWithRole('anon'));
 });

 it('redacts env diagnostics without exposing the key', () => {
  const env = resolveE2EEnv({
   VITE_SUPABASE_ANON_KEY: 'sb_publishable_custom',
  });
  const redacted = redactE2EEnvForLog(env, {
   VITE_SUPABASE_ANON_KEY: 'sb_publishable_custom',
  });
  const serialized = JSON.stringify(redacted);

  expect(serialized).toContain('[redacted:publishable]');
  expect(serialized).toContain('process.env');
  expect(serialized).not.toContain('sb_publishable_custom');
 });
});

describe('E2E runner', () => {
 it('skips vision E2E without a Gemini key', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;

  const result = spawnSync(process.execPath, ['scripts/run-e2e.cjs', '--grep', '@vision'], {
   cwd: process.cwd(),
   env,
   encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Vision E2E skipped');
 expect(result.stdout).toContain('value redacted');
 expect(result.stdout).not.toContain('GEMINI_API_KEY=');
 });

 it('skips vision E2E when PowerShell drops an unquoted @vision token', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;

  const result = spawnSync(process.execPath, ['scripts/run-e2e.cjs', '--grep'], {
   cwd: process.cwd(),
   env,
   encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Vision E2E skipped');
  expect(result.stdout).toContain('value redacted');
  expect(result.stdout).not.toContain('GEMINI_API_KEY=');
 });
});
