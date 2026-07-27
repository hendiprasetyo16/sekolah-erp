import { useCallback } from 'react';
import { useUIStore } from '../stores/ui.store';
import { translations, type TranslationKey } from '../constants/translations';

export function useTranslation() {
  const locale = useUIStore((state) => state.locale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const keys = key.split('.');
      let value: any = translations[locale];
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return key; // Return key if translation not found
        }
      }

      if (typeof value !== 'string') return key;

      if (params) {
        return Object.entries(params).reduce(
          (str, [paramKey, paramValue]) => str.replace(`{{${paramKey}}}`, String(paramValue)),
          value
        );
      }

      return value;
    },
    [locale]
  );

  return { t, locale };
}
