// src/hooks/useTranslation.ts
import { useCallback } from 'react';
import { useUIStore } from '../stores/ui.store';
import { translations, type TranslationKey } from '../constants/translations';

const resolutionCache = new Map<string, string>();
const PLACEHOLDER_REGEX = /\{\{\s*([^{}\s]+)\s*\}\}|\{\s*([^{}\s]+)\s*\}/g;

function resolveNestedValue(source: unknown, keys: string[]): string | undefined {
  let current: unknown = source;

  for (const k of keys) {
    if (typeof current === 'object' && current !== null && Object.hasOwn(current, k)) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

function getResolvedTemplate(locale: string, key: TranslationKey): string {
  const cacheKey = `${locale}:${key}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const keys = key.split('.');
  const activeDictionary =
    translations[locale as keyof typeof translations] ?? translations.id;

  // Cari di bahasa aktif terlebih dahulu, jika tidak ada gunakan fallback bahasa Indonesia
  const resolved =
    resolveNestedValue(activeDictionary, keys) ??
    resolveNestedValue(translations.id, keys) ??
    key;

  resolutionCache.set(cacheKey, resolved);
  return resolved;
}

export function useTranslation() {
  const locale = useUIStore((state) => state.locale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const template = getResolvedTemplate(locale, key);

      if (!params) {
        return template;
      }

      return template.replace(PLACEHOLDER_REGEX, (match, doubleBraceKey, singleBraceKey) => {
        const paramKey = (doubleBraceKey ?? singleBraceKey) as string;
        if (Object.hasOwn(params, paramKey)) {
          return String(params[paramKey]);
        }
        return match;
      });
    },
    [locale]
  );

  return { t, locale };
}