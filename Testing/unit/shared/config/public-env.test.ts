import { describe, expect, it } from 'vitest';
import { getSupabaseClientEnv, validatePublicEnv } from '@/shared/config/public-env';

describe('public env validation', () => {
    it('reports missing required Vite Supabase keys without throwing', () => {
        const result = validatePublicEnv({});

        expect(result.isValid).toBe(false);
        expect(result.missingKeys).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
        expect(getSupabaseClientEnv(result)).toEqual({
            supabaseUrl: 'http://127.0.0.1:54321',
            supabaseAnonKey: 'missing-vite-supabase-anon-key',
        });
    });

    it('trims configured values and does not report them as missing', () => {
        const result = validatePublicEnv({
            VITE_SUPABASE_URL: ' https://project.supabase.co ',
            VITE_SUPABASE_ANON_KEY: ' sb_publishable_test ',
        });

        expect(result).toMatchObject({
            isValid: true,
            supabaseUrl: 'https://project.supabase.co',
            supabaseAnonKey: 'sb_publishable_test',
            missingKeys: [],
        });
    });
});
