import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { LocaleSwitcher } from '@/features/settings/components/LocaleSwitcher';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@test/render-with-providers';

describe('LocaleSwitcher', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('en');
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the label from the settings namespace', () => {
    renderWithProviders(<LocaleSwitcher />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('persists the chosen locale to localStorage and re-renders downstream consumers', async () => {
    renderWithProviders(<LocaleSwitcher />);
    expect(screen.getByText('Language')).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('es');
    });

    expect(i18n.language).toBe('es');
    expect(window.localStorage.getItem('planterplan.locale')).toBe('es');
    expect(screen.getByText('Idioma')).toBeInTheDocument();
  });

  it('labels Spanish as beta and review-required in the switcher', async () => {
    renderWithProviders(<LocaleSwitcher />);

    await act(async () => {
      await i18n.changeLanguage('es');
    });

    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Revisión humana requerida antes de afirmaciones comerciales o de lanzamiento.'))
      .toBeInTheDocument();
  });

  it('keeps the review-required warning visible for regional Spanish locales', async () => {
    renderWithProviders(<LocaleSwitcher />);

    await act(async () => {
      await i18n.changeLanguage('es-MX');
    });

    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Español');
    expect(screen.getByText('Revisión humana requerida antes de afirmaciones comerciales o de lanzamiento.'))
      .toBeInTheDocument();
  });
});
