import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  ownerName: string;
  promoCode: string;
  promoCodeId: string;
  token: string;
  appUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, ownerName, promoCode, promoCodeId, token, appUrl }: EmailRequest = await req.json();

    if (!email || !ownerName || !promoCode || !promoCodeId || !token) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const passwordSetupLink = `${appUrl}/influencer/set-password?id=${promoCodeId}&token=${encodeURIComponent(token)}`;

    const emailResponse = await resend.emails.send({
      from: "DripLove <onboarding@resend.dev>",
      to: [email],
      subject: "Set Up Your Influencer Portal Password - DripLove",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f4f9;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <tr>
              <td>
                <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to DripLove!</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Influencer Partner Program</p>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  <p style="font-size: 18px; color: #333; margin-top: 0;">Hi ${ownerName},</p>
                  
                  <p style="color: #666; line-height: 1.6;">
                    Congratulations! Your influencer account has been created. You can now access your personal portal to track your referrals, commissions, and request payouts.
                  </p>
                  
                  <div style="background: #f8f4f9; padding: 20px; border-radius: 12px; margin: 25px 0; text-align: center;">
                    <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">Your Promo Code</p>
                    <p style="margin: 0; font-size: 32px; font-weight: bold; color: #ec4899; letter-spacing: 2px;">${promoCode}</p>
                  </div>
                  
                  <p style="color: #666; line-height: 1.6;">
                    To get started, please set up your password by clicking the button below:
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${passwordSetupLink}" style="display: inline-block; background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                      Set Your Password
                    </a>
                  </div>
                  
                  <p style="color: #999; font-size: 14px; line-height: 1.6;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${passwordSetupLink}" style="color: #8b5cf6; word-break: break-all;">${passwordSetupLink}</a>
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
                  
                  <p style="color: #999; font-size: 12px; margin-bottom: 0; text-align: center;">
                    This email was sent by DripLove. If you didn't request this, please ignore this email.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
