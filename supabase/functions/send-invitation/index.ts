import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface InvitationRequest {
  inviteeEmail: string
  inviteeName: string
  inviterName: string
  inviterId: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Parse request body
    const { inviteeEmail, inviteeName, inviterName, inviterId }: InvitationRequest = await req.json()

    if (!inviteeEmail || !inviterName) {
      throw new Error('Missing required fields: inviteeEmail, inviterName')
    }

    // Send email using Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Vasuli <onboarding@resend.dev>', // Update with your verified domain
        to: [inviteeEmail],
        subject: `${inviterName} invited you to join Vasuli!`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>You're invited to Vasuli</title>
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
                          <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                            You're invited! 🎉
                          </h2>
                          <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                            <strong>${inviterName}</strong> has invited you to join Vasuli, the easiest way to split expenses and settle up with friends.
                          </p>
                          <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                            With Vasuli, you can:
                          </p>
                          <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.8;">
                            <li>Split bills and expenses with friends</li>
                            <li>Track who owes what in real-time</li>
                            <li>Settle up easily with integrated payments</li>
                            <li>Create groups for trips and shared expenses</li>
                          </ul>
                          
                          <!-- CTA Button -->
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" style="padding: 20px 0;">
                                <a href="vasuli://signup?email=${encodeURIComponent(inviteeEmail)}&inviter=${encodeURIComponent(inviterId)}" 
                                   style="display: inline-block; background: linear-gradient(135deg, #2DD4BF 0%, #22C55E 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(45, 212, 191, 0.3);">
                                  Accept Invitation
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6; text-align: center;">
                            Or copy this link: <br>
                            <a href="vasuli://signup?email=${encodeURIComponent(inviteeEmail)}&inviter=${encodeURIComponent(inviterId)}" 
                               style="color: #2DD4BF; text-decoration: none; word-break: break-all;">
                              vasuli://signup?email=${encodeURIComponent(inviteeEmail)}
                            </a>
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
                            © ${new Date().getFullYear()} Vasuli. All rights reserved.
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
      throw new Error(`Resend API error: ${error}`)
    }

    const data = await res.json()

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Error sending invitation:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
