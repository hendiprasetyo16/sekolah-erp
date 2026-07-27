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

function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value && defaultValue === undefined) {
    console.warn(`[ENV] Missing environment variable: ${key}`);
    return '';
  }
  return value ?? defaultValue ?? '';
}

function getBoolEnv(key: string, defaultValue = false): boolean {
  const value = getEnvVar(key, String(defaultValue));
  return value === 'true' || value === '1';
}

export const env: EnvConfig = {
  apiBaseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:4000/api'),
  appName: getEnvVar('VITE_APP_NAME', 'SekolahERP'),
  appVersion: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  enableMock: getBoolEnv('VITE_ENABLE_MOCK', true),
  enableDebug: getBoolEnv('VITE_ENABLE_DEBUG', false),
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL', ''),
  supabaseAnonKey: getEnvVar('VITE_SUPABASE_ANON_KEY', ''),
};

// Freeze to prevent accidental mutation
Object.freeze(env);
