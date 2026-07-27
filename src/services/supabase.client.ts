import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing in environment variables.');
}

export const supabase = createClient(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseAnonKey || 'placeholder'
);
