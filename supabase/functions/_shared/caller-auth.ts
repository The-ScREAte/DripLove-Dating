// Shared caller authentication for edge functions that run with verify_jwt = false
// (or that must be restricted further than "any logged-in user").
//
// - Service callers (cron / other edge functions) send the project's service-role
//   key as the Bearer token (this is what cron/cron.js does).
// - End users send their own session JWT.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

/** Constant-time string comparison (avoids leaking how many leading chars matched). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  // Always walk the longer length so timing does not depend on where they differ.
  const len = Math.max(ab.length, bb.length)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

function bearerToken(req: Request): string {
  const header = req.headers.get('Authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

/** True when the request carries the service-role key (cron / internal calls only). */
export function isServiceRoleRequest(req: Request): boolean {
  if (!SUPABASE_SERVICE_ROLE_KEY) return false
  const token = bearerToken(req)
  return token.length > 0 && timingSafeEqual(token, SUPABASE_SERVICE_ROLE_KEY)
}

export interface AuthedCaller {
  id: string
  email: string | null
  isAdmin: boolean
}

/**
 * Resolve the logged-in user from the request's JWT using the auth server
 * (never trusts a user id sent in the body). Returns null if not logged in.
 */
export async function getAuthedCaller(
  req: Request,
  admin?: SupabaseClient,
): Promise<AuthedCaller | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  const token = bearerToken(req)
  if (!token) return null
  const client = admin ?? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: profile } = await client
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  return { id: data.user.id, email: data.user.email ?? null, isAdmin: profile?.is_admin === true }
}

/**
 * Authorization for cron-only endpoints. Accepts, in order:
 *  1. the service-role key as Bearer (cron/cron.js, other edge functions);
 *  2. an `x-cron-secret` header equal to internal_secrets[secretKey];
 *  3. TRANSITIONAL: the project's public anon key as Bearer, which is how the
 *     existing pg_cron job calls subscription-checker. Allowed only while
 *     ALLOW_LEGACY_ANON_CRON is not 'false'; set it to 'false' once the cron job
 *     has been rescheduled with the cron secret (see the audit notes).
 */
export async function isCronAuthorized(
  req: Request,
  admin: SupabaseClient,
  secretKey: string,
): Promise<boolean> {
  if (isServiceRoleRequest(req)) return true

  const provided = req.headers.get('x-cron-secret')
  if (provided) {
    const { data } = await admin.from('internal_secrets').select('value').eq('key', secretKey).maybeSingle()
    const expected = (data as { value?: string } | null)?.value
    if (expected && timingSafeEqual(provided, expected)) return true
  }

  if ((Deno.env.get('ALLOW_LEGACY_ANON_CRON') ?? 'true') !== 'false') {
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const token = bearerToken(req)
    if (anon && token && timingSafeEqual(token, anon)) {
      console.warn('[cron-auth] legacy anon-key cron call accepted; migrate the cron job to x-cron-secret')
      return true
    }
  }
  return false
}
