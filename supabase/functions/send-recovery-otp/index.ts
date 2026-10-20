// Velour — send-recovery-otp Edge Function
// Sends a 6-digit OTP to the user's proposed recovery email.
// Powered by Resend (or SMTP).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL     = Deno.env.get('RECOVERY_FROM_EMAIL') || 'Velour Security <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, code, username } = await req.json();

    if (!email || !code) {
      return json({ error: 'Missing email or code' }, 400);
    }

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured. OTP generated for dev:', code);
      return json({
        success: true,
        dev_mode: true,
        message: 'No email service configured. OTP logged securely.',
      });
    }

    const emailHtml = `
      <div style="background-color: #0a0a0a; color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; text-align: center;">
        <div style="max-width: 440px; margin: 0 auto; background-color: #121212; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 36px 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 20px; font-weight: 700; letter-spacing: 0.15em; color: #ffffff; text-transform: uppercase;">VELOUR</span>
          </div>
          
          <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #ffffff;">Verify Your Recovery Email</h2>
          
          <p style="font-size: 13px; line-height: 1.6; color: #888888; margin: 0 0 28px 0;">
            ${username ? `Hi @${username}, you` : 'You'} recently requested to link this email as your recovery address on Velour. Enter this 6-digit confirmation code:
          </p>
          
          <div style="background-color: #181818; border: 1px solid rgba(20, 184, 166, 0.3); border-radius: 14px; padding: 18px 24px; margin-bottom: 28px; display: inline-block;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #2dd4bf; font-family: monospace;">${code}</span>
          </div>
          
          <p style="font-size: 12px; color: #666666; margin: 0 0 8px 0;">
            This code expires in <strong>10 minutes</strong>. If you did not request this, please disregard this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 28px 0;" />
          
          <p style="font-size: 11px; color: #444444; margin: 0;">
            © ${new Date().getFullYear()} Velour. Encrypted creator-first ecosystem.
          </p>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Your Velour Verification Code: ${code}`,
        html: emailHtml,
      }),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error('Resend error:', resData);
      return json({ error: resData.message || 'Failed to dispatch email' }, 500);
    }

    return json({ success: true, id: resData.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return json({ error: msg }, 500);
  }
});
