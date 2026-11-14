// src/hooks/useTranslation.ts
import { useCallback } from 'react';
import { useUIStore } from '../stores/ui.store';
import { translations, type TranslationKey } from '../constants/translations';

function resolveNestedValue(source: unknown, keys: string[]): string | undefined {
  let current: unknown = source;

  for (const k of keys) {
    if (typeof current === 'object' && current !== null && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

export function useTranslation() {
  const locale = useUIStore((state) => state.locale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const keys = key.split('.');
      const activeDictionary = translations[locale] ?? translations.id;

      // Cari di bahasa aktif terlebih dahulu, jika tidak ada gunakan fallback bahasa Indonesia
      const resolved =
        resolveNestedValue(activeDictionary, keys) ??
        resolveNestedValue(translations.id, keys);

      if (!resolved) {
        return key;
      }

      if (!params) {
        return resolved;
      }

      return Object.entries(params).reduce((str, [paramKey, paramValue]) => {
        const escapedKey = paramKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\{\\{${escapedKey}\\}\\}|\\{${escapedKey}\\}`, 'g');
        return str.replace(pattern, String(paramValue));
      }, resolved);
    },
    [locale]
  );

  return { t, locale };
}