// src/config/env.ts
// Type-safe environment configuration
// All env vars are accessed through this module — NEVER use import.meta.env directly elsewhere

interface EnvConfig {
  apiBaseUrl: string;
  appName: string;
  appVersion: string;
  enableMock: boolean;
  enableDebug: boolean;
  isDev: boolean;
  isProd: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function getEnvVar(key: string, defaultValue?: string, required = false): string {
  const rawValue = import.meta.env[key] as string | undefined;
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : undefined;

  if (!trimmedValue) {
    if (required || defaultValue === undefined) {
      console.error(`[ENV] Missing required environment variable: ${key}`);
    }
    return defaultValue ?? '';
  }

  return trimmedValue;
}

function getBoolEnv(key: string, defaultValue = false): boolean {
  const value = getEnvVar(key, String(defaultValue)).toLowerCase();
  return value === 'true' || value === '1';
}

export const env: EnvConfig = {
  apiBaseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:4000/api').replace(/\/+$/, ''),
  appName: getEnvVar('VITE_APP_NAME', 'SekolahERP'),
  appVersion: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  enableMock: getBoolEnv('VITE_ENABLE_MOCK', false),
  enableDebug: getBoolEnv('VITE_ENABLE_DEBUG', false),
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL', '', true).replace(/\/+$/, ''),
  supabaseAnonKey: getEnvVar('VITE_SUPABASE_ANON_KEY', '', true),
};

// Freeze to prevent accidental mutation
Object.freeze(env);