import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@/shared/i18n';
import { BootConfigGate } from '@/app/App';

describe('BootConfigGate', () => {
    it('renders children when public env validation passes', () => {
        render(
            <I18nextProvider i18n={i18n}>
                <BootConfigGate
                    validation={{
                        isValid: true,
                        missingKeys: [],
                        supabaseUrl: 'https://project.supabase.co',
                        supabaseAnonKey: 'sb_publishable_test',
                    }}
                >
                    <div data-testid="boot-child" />
                </BootConfigGate>
            </I18nextProvider>,
        );

        expect(screen.getByTestId('boot-child')).toBeInTheDocument();
    });

    it('shows missing env names without exposing configured values', () => {
        render(
            <I18nextProvider i18n={i18n}>
                <BootConfigGate
                    validation={{
                        isValid: false,
                        missingKeys: ['VITE_SUPABASE_ANON_KEY'],
                        supabaseUrl: 'https://sensitive-project.supabase.co',
                        supabaseAnonKey: null,
                    }}
                >
                    <div data-testid="boot-child" />
                </BootConfigGate>
            </I18nextProvider>,
        );

        expect(screen.getByTestId('boot-config-error')).toBeInTheDocument();
        expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument();
        expect(screen.queryByTestId('boot-child')).not.toBeInTheDocument();
        expect(screen.queryByText('https://sensitive-project.supabase.co')).not.toBeInTheDocument();
    });
});
