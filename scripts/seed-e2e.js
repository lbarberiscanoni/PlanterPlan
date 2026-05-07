import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { redactE2EEnvForLog, resolveE2EEnv } = require('./e2e-env.cjs');
const e2eEnv = resolveE2EEnv();
const supabase = createClient(e2eEnv.VITE_SUPABASE_URL, e2eEnv.VITE_SUPABASE_ANON_KEY);

async function seed() {
  console.log('[seed-e2e] Using local E2E environment:', JSON.stringify(redactE2EEnvForLog(e2eEnv)));

  const { data, error } = await supabase.auth.signUp({
    email: 'test@example.com',
    password: 'password123',
  });
  if (error) {
    if (error.message.includes('User already registered')) {
        console.log('User already exists');
    } else {
        console.error('Failed to seed user:', error);
        process.exit(1);
    }
  } else {
    console.log('Successfully seeded test@example.com');
  }
}

seed();
