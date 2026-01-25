import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SendEmailPayload {
  recipients: string[] // Array of email addresses
  subject: string
  htmlContent: string
  textContent?: string
  // Optional metadata for logging
  targetCountries?: string[]
  recipientFilter?: string
  adminId?: string
}

// Helper function to send email via Brevo with automatic fallback
async function sendViaBrevo(
  to: string,
  subject: string,
  html: string,
  text: string,
  brevoKeys: string[],
  senderEmails: string[]
) {
  let lastError: Error | null = null
  
  // Try each API key in order until one succeeds
  for (let i = 0; i < brevoKeys.length; i++) {
    const brevoKey = brevoKeys[i]
    const senderEmail = senderEmails[i] || senderEmails[0]
    
    try {
      console.log(`📤 Attempting to send from account ${i + 1}: ${senderEmail}`)
      
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: 'DripLove' },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html,
          textContent: text,
          headers: {
            'List-Unsubscribe': '<https://driplove.love/unsubscribe>',
            'X-Priority': '3',
          },
        }),
      })
      
      const responseText = await response.text()
      console.log(`Response status: ${response.status}`)
      console.log(`Response body: ${responseText}`)
      
      if (!response.ok) {
        const error = new Error(`Brevo API error (${response.status}): ${responseText}`)
        
        // If daily limit reached or rate limited, try next key
        if (response.status === 429 || responseText.includes('daily limit') || responseText.includes('quota')) {
          console.warn(`⚠️ Account ${i + 1} (${senderEmail}) quota reached, trying next account...`)
          lastError = error
          continue // Try next key
        }
        
        throw error // Other errors should fail immediately
      }
      
      const result = JSON.parse(responseText)
      console.log(`✅ Email sent successfully via account ${i + 1} (${senderEmail})`)
      if (i > 0) {
        console.log(`ℹ️ Used fallback account ${i + 1}`)
      }
      return result
      
    } catch (error) {
      lastError = error as Error
      console.error(`Failed with account ${i + 1}:`, error)
      
      // If not the last key, continue to next
      if (i < brevoKeys.length - 1) {
        continue
      }
    }
  }
  
  // If all keys failed, throw the last error
  throw lastError || new Error('All Brevo accounts failed')
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // TEMPORARILY BYPASSED - Admin check disabled for testing
    // TODO: Re-enable admin check after testing
    /*
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }
    */

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

    console.log(`📧 Sending email to ${recipients.length} recipient(s): "${subject}"`)

    const results = {
      successful: [] as string[],
      failed: [] as { email: string; error: string }[],
    }

    // Check which email service to use (support multiple keys)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const BREVO_API_KEYS = Deno.env.get('BREVO_API_KEYS') || Deno.env.get('BREVO_API_KEY') // Support both single and multiple
    const GMAIL_USERS = Deno.env.get('GMAIL_USERS') || Deno.env.get('GMAIL_USER')
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

    let emailService = 'none'
    let brevoKeys: string[] = []
    let senderEmails: string[] = []
    
    if (BREVO_API_KEYS) {
      emailService = 'brevo'
      brevoKeys = BREVO_API_KEYS.split(',').map(k => k.trim())
      // Use verified sender email from Brevo account
      senderEmails = GMAIL_USERS ? GMAIL_USERS.split(',').map(e => e.trim()) : ['driploveinfo@gmail.com']
      console.log(`📤 Using Brevo with ${brevoKeys.length} account(s) (${brevoKeys.length * 300} emails/day)`)
      console.log(`   Accounts: ${senderEmails.join(', ')}`)
    } else if (RESEND_API_KEY) {
      emailService = 'resend'
      console.log(`📤 Using Resend from: ${FROM_EMAIL}`)
    } else {
      console.error('❌ No email service configured!')
      return new Response(
        JSON.stringify({
          error: 'Email service not configured.',
          options: {
            'Brevo (FREE - 300/day each)': 'supabase secrets set BREVO_API_KEYS=key1,key2 GMAIL_USERS=email1,email2',
            'Resend (100/day free)': 'supabase secrets set RESEND_API_KEY=re_xxx',
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Send emails in batches to avoid rate limits
    const BATCH_SIZE = emailService === 'brevo' ? 3 : 10
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      
      // Send emails in parallel within the batch
      const batchPromises = batch.map(async (email) => {
        try {
          console.log(`📧 Sending to: ${email}`)
          
          if (emailService === 'brevo') {
            // Send via Brevo API with automatic fallback
            await sendViaBrevo(email, subject, htmlContent, textContent || '', brevoKeys, senderEmails)
          } else {
            // Send via Resend API
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `DripLove <${FROM_EMAIL}>`,
                to: [email],
                subject: subject,
                html: htmlContent,
                text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
              }),
            })

            const responseData = await emailResponse.json()

            if (!emailResponse.ok) {
              throw new Error(`Resend API error: ${JSON.stringify(responseData)}`)
            }
          }

          console.log(`✅ Email sent successfully to ${email}`)
          results.successful.push(email)
          
        } catch (error) {
          console.error(`❌ Failed to send email to ${email}:`, error)
          results.failed.push({
            email,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      })

      await Promise.all(batchPromises)
      
      // Add delay between batches
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, emailService === 'brevo' ? 3000 : 1000))
      }
    }

    console.log(`✅ Email broadcast complete: ${results.successful.length} sent, ${results.failed.length} failed`)

    // Log to email_broadcast_history table
    try {
      const { error: historyError } = await supabaseAdmin
        .from('email_broadcast_history')
        .insert({
          admin_id: adminId || null,
          subject: subject,
          message: textContent || htmlContent.substring(0, 1000),
          recipient_count: recipients.length,
          successful_sends: results.successful.length,
          failed_sends: results.failed.length,
          target_countries: targetCountries || [],
          recipient_filter: recipientFilter || 'all',
          status: results.failed.length === 0 ? 'completed' : 'partial',
          error_details: results.failed.length > 0 ? results.failed : [],
        })
      
      if (historyError) {
        console.error('Failed to log email broadcast history:', historyError)
      } else {
        console.log('📝 Email broadcast logged to history')
      }
    } catch (logError) {
      console.error('Error logging broadcast history:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: {
          sent: results.successful.length,
          failed: results.failed.length,
          details: results,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error in send-broadcast-email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    
    // Provide more specific error messages
    let userFriendlyError = errorMessage
    if (errorMessage.includes('daily limit') || errorMessage.includes('quota')) {
      userFriendlyError = 'Email sending quota exceeded. Try again tomorrow or add more Brevo API keys.'
    } else if (errorMessage.includes('api-key') || errorMessage.includes('unauthorized')) {
      userFriendlyError = 'Email service authentication failed. Check your Brevo/Resend API keys in Supabase secrets.'
    } else if (errorMessage.includes('BREVO') || errorMessage.includes('Brevo')) {
      userFriendlyError = `Brevo API error: ${errorMessage}`
    } else if (errorMessage.includes('RESEND') || errorMessage.includes('Resend')) {
      userFriendlyError = `Resend API error: ${errorMessage}`
    }
    
    return new Response(
      JSON.stringify({
        error: userFriendlyError,
        details: errorMessage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
