import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build-time prerender on the server, avoid throwing for missing envs.
  if (!url || !anonKey) {
    if (typeof window === 'undefined') {
      return {} as ReturnType<typeof createBrowserClient>;
    }

    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  client = createBrowserClient(url, anonKey);

  return client;
}
