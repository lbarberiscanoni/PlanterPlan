import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { SUPPORTED_LOCALES } from '@/shared/i18n';

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const activeLocaleCode = (i18n.resolvedLanguage ?? i18n.language).split('-')[0];
  const selectedLocale =
    SUPPORTED_LOCALES.find((locale) => locale.code === activeLocaleCode) ?? SUPPORTED_LOCALES[0];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
      <label className="pt-2 text-slate-700">{t('settings.profile.locale_label')}</label>
      <div className="flex flex-col gap-3">
        <Select
          value={selectedLocale.code}
          onValueChange={(code) => void i18n.changeLanguage(code)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((locale) => (
              <SelectItem key={locale.code} value={locale.code}>
                <span className="flex min-w-0 items-center gap-2">
                  <span>{locale.label}</span>
                  {locale.reviewRequiredBeforeMarketing ? (
                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium uppercase text-amber-800">
                      {t('settings.profile.locale_beta_badge')}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedLocale.reviewRequiredBeforeMarketing ? (
          <p className="max-w-56 text-xs leading-5 text-amber-700">
            {t('settings.profile.locale_review_required_note')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
