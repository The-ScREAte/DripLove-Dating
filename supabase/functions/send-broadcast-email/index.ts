import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SendEmailPayload {
  recipients: string[]
  subject: string
  htmlContent: string
  textContent?: string
  targetCountries?: string[]
  recipientFilter?: string
  adminId?: string
}

type SendResults = {
  sent: number
  failed: number
  details?: {
    successful?: string[]
    failed?: Array<{ email: string; error: string }>
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const payload: SendEmailPayload = await req.json()
    const { recipients, subject, htmlContent, textContent, targetCountries, recipientFilter, adminId } = payload

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!subject || !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'Subject and content are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const EMAIL_SERVICE_URL = Deno.env.get('EMAIL_SERVICE_URL')
    const EMAIL_SERVICE_API_KEY = Deno.env.get('EMAIL_SERVICE_API_KEY')

    if (!EMAIL_SERVICE_URL || !EMAIL_SERVICE_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'SMTP email service is not configured. Set EMAIL_SERVICE_URL and EMAIL_SERVICE_API_KEY.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const endpoint = `${EMAIL_SERVICE_URL.replace(/\/$/, '')}/api/email/send-broadcast-email-smtp`
    const smtpResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-email-api-key': EMAIL_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        recipients,
        subject,
        htmlContent,
        textContent,
      }),
    })

    const smtpData = await smtpResponse.json().catch(() => ({} as Record<string, unknown>))
    if (!smtpResponse.ok) {
      throw new Error((smtpData as { error?: string }).error || `SMTP service error (${smtpResponse.status})`)
    }

    const smtpResults = ((smtpData as { results?: SendResults }).results || {
      sent: 0,
      failed: 0,
    }) as SendResults

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
      const { error: historyError } = await supabaseAdmin
        .from('email_broadcast_history')
        .insert({
          admin_id: adminId || null,
          subject,
          message: textContent || htmlContent.substring(0, 1000),
          recipient_count: recipients.length,
          successful_sends: smtpResults.sent || 0,
          failed_sends: smtpResults.failed || 0,
          target_countries: targetCountries || [],
          recipient_filter: recipientFilter || 'all',
          status: (smtpResults.failed || 0) === 0 ? 'completed' : 'partial',
          error_details: smtpResults.details?.failed || [],
        })

      if (historyError) {
        console.error('Failed to log email broadcast history:', historyError)
      }
    } catch (logError) {
      console.error('Error logging broadcast history:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'smtp-nodemailer',
        results: smtpResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in send-broadcast-email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorMessage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
