import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { inviteCtaUrl, parseInvitationBody } from './invitation.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawBody = await req.json()
    const parsed = parseInvitationBody(rawBody)
    if (!parsed.ok) {
      if ('missing' in parsed) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields', missing: parsed.missing }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { inviteeEmail, inviteeName, inviterName, inviterId, invitationId } = parsed.data

    // Send invitation email via Resend
    const emailSent = await sendInvitationEmail(
      inviteeEmail,
      inviteeName,
      inviterName,
      inviterId,
      invitationId
    )

    if (!emailSent) {
      throw new Error('Failed to send invitation email')
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Invitation sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error sending invitation:', error)
    const message = error instanceof Error ? error.message : 'Failed to send invitation'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function sendInvitationEmail(
  inviteeEmail: string,
  inviteeName: string,
  inviterName: string,
  inviterId: string,
  invitationId: string
): Promise<boolean> {
  const joinUrl = inviteCtaUrl(inviterId, invitationId)

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured.');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Vasuli <support@split-space.com>',
        to: [inviteeEmail],
        subject: `${inviterName} invited you to Vasuli! 🎉`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${inviterName} invited you to Vasuli!</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #2DD4BF 0%, #22C55E 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">Vasuli</h1>
                          <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Split expenses with friends</p>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">You're Invited! 🎉</h2>
                          <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                            Hi ${inviteeName}!
                          </p>
                          <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                            <strong style="color: #2DD4BF;">${inviterName}</strong> has invited you to join Vasuli, the easiest way to split expenses and settle up with friends.
                          </p>
                          
                          <!-- Features -->
                          <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 30px 0;">
                            <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 600;">With Vasuli, you can:</p>
                            <ul style="margin: 0; padding: 0 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                              <li>Split bills and expenses easily</li>
                              <li>Track who owes what in real-time</li>
                              <li>Settle up with friends seamlessly</li>
                              <li>Create groups for trips and events</li>
                            </ul>
                          </div>
                          
                          <!-- CTA Button -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                            <tr>
                              <td align="center">
                                <a href="${joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #2DD4BF 0%, #22C55E 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(45, 212, 191, 0.3);">
                                  Join Vasuli
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                            Start splitting expenses with ${inviterName} and keep track of shared costs effortlessly.
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                            This invitation was sent by ${inviterName}
                          </p>
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                            © 2026 Vasuli. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('Resend API error:', error)
      return false
    }

    const data = await res.json()
    console.log('Invitation email sent successfully:', data)
    return true
  } catch (error: unknown) {
    console.error('Error sending invitation email:', error)
    return false
  }
}
