const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEFAULT_LOCAL_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

function normalizeUrl(value) {
  return String(value ?? '').trim();
}

function isLocalSupabaseUrl(value) {
  const url = normalizeUrl(value);
  return url === LOCAL_SUPABASE_URL || url === 'http://localhost:54321';
}

function isRemoteLookingSupabaseUrl(value) {
  const url = normalizeUrl(value);
  if (!url) {
    return false;
  }

  if (isLocalSupabaseUrl(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost';
  } catch {
    return true;
  }
}

function decodeJwtPayload(key) {
  const parts = String(key).split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function assertSafeAnonKey(key) {
  const value = String(key ?? '').trim();
  if (!value) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY for local E2E.');
  }

  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith('sb_secret') || lowerValue.includes('service_role')) {
    throw new Error('Refusing to use a service-role or secret-looking Supabase key for local E2E.');
  }

  const payload = decodeJwtPayload(value);
  if (String(payload?.role ?? '').toLowerCase() === 'service_role') {
    throw new Error('Refusing to use a service-role JWT for local E2E.');
  }

  return value;
}

function resolveE2EEnv(sourceEnv = process.env) {
  const requestedUrl = normalizeUrl(sourceEnv.VITE_SUPABASE_URL);
  if (isRemoteLookingSupabaseUrl(requestedUrl)) {
    throw new Error('Refusing to run E2E with a non-local Supabase URL in VITE_SUPABASE_URL.');
  }

  const resolvedAnonKey = assertSafeAnonKey(
    sourceEnv.VITE_SUPABASE_ANON_KEY || DEFAULT_LOCAL_ANON_KEY,
  );

  return {
    VITE_SUPABASE_URL: LOCAL_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: resolvedAnonKey,
    VITE_E2E_MODE: 'true',
    VITE_TEST_EMAIL: TEST_EMAIL,
    VITE_TEST_PASSWORD: TEST_PASSWORD,
  };
}

function classifyAnonKey(key) {
  const value = String(key ?? '');
  if (!value) {
    return 'missing';
  }

  if (value.startsWith('sb_publishable_')) {
    return 'publishable';
  }

  const payload = decodeJwtPayload(value);
  if (payload && typeof payload === 'object') {
    return 'jwt';
  }

  return 'present';
}

function redactE2EEnvForLog(e2eEnv, sourceEnv = process.env) {
  const keySource = sourceEnv.VITE_SUPABASE_ANON_KEY ? 'process.env' : 'local-default';
  const keyType = classifyAnonKey(e2eEnv?.VITE_SUPABASE_ANON_KEY);

  return {
    VITE_SUPABASE_URL: e2eEnv?.VITE_SUPABASE_URL === LOCAL_SUPABASE_URL ? LOCAL_SUPABASE_URL : '[non-local-blocked]',
    VITE_SUPABASE_ANON_KEY: keyType === 'missing' ? '[missing]' : `[redacted:${keyType}]`,
    VITE_SUPABASE_ANON_KEY_SOURCE: keySource,
    VITE_E2E_MODE: e2eEnv?.VITE_E2E_MODE === 'true' ? 'true' : '[not-set]',
    VITE_TEST_EMAIL: e2eEnv?.VITE_TEST_EMAIL ? '[configured]' : '[missing]',
    VITE_TEST_PASSWORD: e2eEnv?.VITE_TEST_PASSWORD ? '[configured]' : '[missing]',
  };
}

module.exports = {
  LOCAL_SUPABASE_URL,
  DEFAULT_LOCAL_ANON_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
  assertSafeAnonKey,
  redactE2EEnvForLog,
  resolveE2EEnv,
};
