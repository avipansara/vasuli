import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface OTPRequest {
  email?: string
  phone?: string
  code: string
  name: string
  type: 'signup' | 'signin'
}

serve(async (req: Request) => {
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
    const { email, phone, code, name, type }: OTPRequest = await req.json()

    if (!email && !phone) {
      throw new Error('Email or phone is required')
    }

    if (!code || !name || !type) {
      throw new Error('Missing required fields: code, name, type')
    }

    // Send OTP via email if email is provided
    if (email) {
      const emailSent = await sendEmailOTP({ email, code, name, type })
      if (!emailSent) {
        throw new Error('Failed to send email OTP')
      }
    }

    // Send OTP via SMS if phone is provided
    if (phone) {
      // TODO: Implement SMS sending with Twilio or similar
      console.log(`SMS OTP not implemented yet. Code: ${code} to ${phone}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: unknown) {
    console.error('Error sending OTP:', error)
    const message = error instanceof Error ? error.message : 'Request failed'
    return new Response(
      JSON.stringify({ error: message }),
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

/**
 * Send OTP via email using Resend
 */
async function sendEmailOTP(params: {
  email: string
  code: string
  name: string
  type: 'signup' | 'signin'
}): Promise<boolean> {
  const { email, code, name, type } = params

  const subject = type === 'signup' 
    ? 'Welcome to Vasuli! Verify your email'
    : 'Sign in to Vasuli'

  const heading = type === 'signup'
    ? 'Welcome to Vasuli! 🎉'
    : 'Sign in to Vasuli'

  const message = type === 'signup'
    ? `Hi ${name}! Thanks for signing up. Use the code below to verify your email and complete your registration.`
    : `Hi ${name}! Use the code below to sign in to your Vasuli account.`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Vasuli <support@split-space.com>',
        to: [email],
        subject,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${subject}</title>
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
                            ${heading}
                          </h2>
                          <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                            ${message}
                          </p>
                          
                          <!-- OTP Code Box -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                            <tr>
                              <td align="center" style="background: linear-gradient(135deg, rgba(45, 212, 191, 0.1) 0%, rgba(34, 197, 94, 0.1) 100%); padding: 30px; border-radius: 12px; border: 2px dashed #2DD4BF;">
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
                                  Your verification code
                                </p>
                                <p style="margin: 0; color: #1f2937; font-size: 48px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                  ${code}
                                </p>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                            This code will expire in <strong>15 minutes</strong>. If you didn't request this code, you can safely ignore this email.
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                            Need help? Contact us at support@vasuli.app
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
      console.error('Resend API error:', error)
      return false
    }

    return true
  } catch (error: unknown) {
    console.error('Error sending email:', error)
    return false
  }
}
