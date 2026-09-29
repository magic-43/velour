import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL || 'https://ksgapugqzqxuogltsudr.supabase.co'
).trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZ2FwdWdxenF4dW9nbHRzdWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODY4NzMsImV4cCI6MjEwNTA2Mjg3M30.wV8TASaAhq5csr9SQrKwhNTmEe0G-RVOs7m9kZAMmmw'
).trim();

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
