// src/services/supabase.client.ts
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.error('[Supabase] URL atau Anon Key belum diatur pada environment variables (.env).');
}

export const supabase = createClient(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);