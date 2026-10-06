import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// Scheduled broadcasts (Admin > Scheduled), email or push.
//
// The chosen time is each person's OWN local time: "Daily at 09:00" reaches
// someone in Accra at 09:00 Accra time and someone in Chicago at 09:00
// Chicago time, on the chosen days (judged by their local date too).
//
// Runs every 15 minutes (see
// 20261005130000_send_when_it_happens_and_local_time_schedules.sql). Each run
// asks prepare_scheduled_broadcast for the people whose chosen time falls in
// the next two hours and lines their message up for that exact minute:
//   email -> email_send_queue (next_attempt_at = their time), sent by
//            process-email-queue with the usual layout, pacing and checks
//   push  -> broadcast_recipients (next_attempt_at = their time), sent by
//            process-broadcast-queue
// Each schedule gets one History entry per day. Turning a schedule off
// cancels whatever was lined up for later that day.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOCK_NAME = 'process-scheduled-broadcasts'
const INSERT_CHUNK = 500

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

type Schedule = {
  id: string
  title: string
  message: string
  channel: string | null
  admin_id: string | null
  target_countries: string[] | null
  total_sends: number | null
}

type Due = { user_id: string; email: string | null; local_date: string; send_at: string }

/** The day's History entry for this schedule - created on first use. */
async function occurrenceRow(
  supabase: SupabaseClient,
  schedule: Schedule,
  day: string,
): Promise<{ id: string; count: number; isNew: boolean }> {
  const isEmail = schedule.channel === 'email'
  const table = isEmail ? 'email_broadcast_history' : 'broadcast_campaigns'
  const countColumn = isEmail ? 'recipient_count' : 'total_recipients'

  const find = async () => {
    const { data } = await supabase
      .from(table)
      .select(`id, ${countColumn}`)
      .eq('scheduled_broadcast_id', schedule.id)
      .eq('occurrence_date', day)
      .maybeSingle()
    return data as Record<string, unknown> | null
  }

  const existing = await find()
  if (existing) return { id: existing.id as string, count: (existing[countColumn] as number) || 0, isNew: false }

  const common = {
    admin_id: schedule.admin_id,
    target_countries: schedule.target_countries && schedule.target_countries.length > 0 ? schedule.target_countries : null,
    scheduled_broadcast_id: schedule.id,
    occurrence_date: day,
  }
  const row = isEmail
    ? { ...common, subject: schedule.title, message: schedule.message, recipient_count: 0, successful_sends: 0,
        failed_sends: 0, status: 'partial', recipient_filter: 'scheduled' }
    : { ...common, title: schedule.title, message: schedule.message, notification_type: 'system', total_recipients: 0,
        successful_sends: 0, failed_sends: 0, status: 'queued', save_to_profile: true }

  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) {
    // Another run created it a moment ago (unique per schedule and day).
    const again = await find()
    if (again) return { id: again.id as string, count: (again[countColumn] as number) || 0, isNew: false }
    throw error
  }
  return { id: data.id as string, count: 0, isNew: true }
}

async function lineUp(supabase: SupabaseClient, schedule: Schedule, day: string, people: Due[]) {
  const occurrence = await occurrenceRow(supabase, schedule, day)
  const isEmail = schedule.channel === 'email'

  for (let i = 0; i < people.length; i += INSERT_CHUNK) {
    const chunk = people.slice(i, i + INSERT_CHUNK)
    const { error } = isEmail
      ? await supabase.from('email_send_queue').insert(chunk.filter((p) => p.email).map((p) => ({
          broadcast_id: occurrence.id,
          recipient: p.email,
          kind: 'broadcast',
          priority: 3,
          attempt_count: 0,
          next_attempt_at: p.send_at,
        })))
      : await supabase.from('broadcast_recipients').insert(chunk.map((p) => ({
          campaign_id: occurrence.id,
          user_id: p.user_id,
          status: 'pending',
          retry_count: 0,
          next_attempt_at: p.send_at,
        })))
    if (error) throw error
  }

  const newCount = occurrence.count + people.length
  if (isEmail) {
    await supabase.from('email_broadcast_history')
      .update({ recipient_count: newCount, status: 'partial' })
      .eq('id', occurrence.id)
  } else {
    await supabase.from('broadcast_campaigns')
      .update({ total_recipients: newCount, status: 'processing' })
      .eq('id', occurrence.id)
  }
  return occurrence.isNew
}

async function run(supabase: SupabaseClient) {
  const { data: cancelled, error: cancelError } = await supabase.rpc('cancel_stopped_scheduled_sends')
  if (cancelError) console.error('Could not cancel sends for stopped schedules:', cancelError)

  const { data: schedules, error } = await supabase
    .from('scheduled_broadcasts')
    .select('id, title, message, channel, admin_id, target_countries, total_sends')
    .eq('is_active', true)
  if (error) throw error

  const results: Array<Record<string, unknown>> = []
  for (const schedule of (schedules || []) as Schedule[]) {
    try {
      const { data, error: prepError } = await supabase.rpc('prepare_scheduled_broadcast', {
        p_schedule_id: schedule.id,
      })
      if (prepError) throw prepError
      const due = (data || []) as Due[]
      if (due.length === 0) continue

      const byDay = new Map<string, Due[]>()
      due.forEach((d) => byDay.set(d.local_date, [...(byDay.get(d.local_date) || []), d]))

      let newDays = 0
      for (const [day, people] of byDay) {
        if (await lineUp(supabase, schedule, day, people)) newDays += 1
      }

      await supabase.from('scheduled_broadcasts').update({
        last_sent_at: new Date().toISOString(),
        total_sends: (schedule.total_sends || 0) + newDays,
      }).eq('id', schedule.id)

      results.push({ id: schedule.id, title: schedule.title, channel: schedule.channel, linedUp: due.length })
    } catch (scheduleError) {
      console.error(`Scheduled broadcast ${schedule.id} failed:`, scheduleError)
      results.push({ id: schedule.id, error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError) })
    }
  }

  console.log('process-scheduled-broadcasts:', JSON.stringify({ cancelled, results }))
  return { cancelled, results }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const { data: gotLock, error: lockError } = await supabase.rpc('try_acquire_worker_lock', {
    p_name: LOCK_NAME,
    p_seconds: 300,
  })
  if (lockError) return json({ error: 'Could not take the lock' }, 500)
  if (!gotLock) return json({ message: 'Another run is in progress' })

  const work = run(supabase)
    .catch((error) => {
      console.error('process-scheduled-broadcasts error:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    })
    .finally(() => supabase.rpc('release_worker_lock', { p_name: LOCK_NAME }))

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work)
    return json({ message: 'Run started' }, 202)
  }
  return json(await work)
})
