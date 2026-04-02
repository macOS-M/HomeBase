import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const fallbackClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    return fallbackClient as any;
  }

  try {
    return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
          }
        },
      },
    });
  } catch {
    return fallbackClient as any;
  }
}
