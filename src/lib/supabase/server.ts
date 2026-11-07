import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

/**
 * Standard cookie-based Supabase Server Client for Server Components & Route Handlers
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be called from Server Component where cookies are read-only
          }
        },
      },
    }
  );
}

export interface AuthResult {
  user: User | null;
  supabase: SupabaseClient;
  error: string | null;
}

/**
 * Authenticates the current request using either:
 * 1. Request cookies (standard Next.js / Supabase SSR session)
 * 2. Authorization Bearer header (for direct client API fetches)
 *
 * Guarantees that the returned `supabase` client is scoped to the user
 * so Row Level Security (auth.uid()) is respected for all queries.
 */
export async function getAuthenticatedUser(req?: NextRequest): Promise<AuthResult> {
  const cookieSupabase = await createClient();

  // 1. Try resolving session from request cookies
  try {
    const {
      data: { user: cookieUser },
      error: cookieErr,
    } = await cookieSupabase.auth.getUser();

    if (cookieUser && !cookieErr) {
      return {
        user: cookieUser,
        supabase: cookieSupabase,
        error: null,
      };
    }
  } catch {
    // Cookie read failed, continue to header check
  }

  // 2. Try resolving from Authorization: Bearer <token> header
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const {
            data: { user: tokenUser },
            error: tokenErr,
          } = await cookieSupabase.auth.getUser(token);

          if (tokenUser && !tokenErr) {
            // Build client with user's JWT so RLS policies work identically
            const tokenSupabase = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                global: {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
                cookies: {
                  getAll: () => [],
                  setAll: () => {},
                },
              }
            );

            return {
              user: tokenUser,
              supabase: tokenSupabase,
              error: null,
            };
          }
        } catch {
          // Token verification failed
        }
      }
    }
  }

  return {
    user: null,
    supabase: cookieSupabase,
    error: "Supabase authentication required. Please log in to your Atharva Chat account.",
  };
}
