import Mailgun from 'mailgun.js'
import FormData from 'form-data'

const mailgun = new Mailgun(FormData)
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY ?? '',
})

const DOMAIN = process.env.MAILGUN_DOMAIN ?? ''
const FROM = process.env.MAILGUN_FROM_EMAIL ?? `noreply@${DOMAIN}`

async function send(params: {
  to: string
  subject: string
  html: string
  text: string
}) {
  return mg.messages.create(DOMAIN, {
    from: `MyCareSight <${FROM}>`,
    to: [params.to.trim()],
    subject: params.subject,
    html: params.html,
    text: params.text,
  })
}

// ——— Auth emails ——————————————————————————————————————————————————————————————

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  try {
    await send({
      to,
      subject: 'Reset your MyCareSight password',
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #0F172A; padding: 24px 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #22C55E; margin: 0; font-size: 22px;">MyCareSight</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <p style="font-size: 16px;">You requested a password reset for your MyCareSight account.</p>
              <p style="font-size: 16px;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Reset Password
                </a>
              </div>
              <p style="font-size: 14px; color: #6b7280;">If you did not request this, you can safely ignore this email.</p>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                — The MyCareSight Team
              </p>
            </div>
          </body>
        </html>
      `,
      text: `Reset your MyCareSight password\n\nClick the link below to set a new password (expires in 1 hour):\n${resetLink}\n\nIf you did not request this, ignore this email.`,
    })
    return { success: true }
  } catch (error) {
    console.error('sendPasswordResetEmail error:', error)
    return { success: false, error }
  }
}

export async function sendInvitationEmail(
  to: string,
  fullName: string,
  tempPassword: string,
  agencyName?: string
) {
  try {
    const greeting = agencyName
      ? `You have been invited to join <strong>${agencyName}</strong> on MyCareSight.`
      : 'You have been invited to MyCareSight.'

    await send({
      to,
      subject: 'Your MyCareSight account is ready',
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #0F172A; padding: 24px 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #22C55E; margin: 0; font-size: 22px;">MyCareSight</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <p style="font-size: 16px;">Hi ${fullName},</p>
              <p style="font-size: 16px;">${greeting}</p>
              <p style="font-size: 16px;">Your temporary password is:</p>
              <div style="background: white; padding: 16px 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0; font-size: 20px; font-family: monospace; letter-spacing: 2px;">
                ${tempPassword}
              </div>
              <p style="font-size: 14px; color: #4b5563;">Log in at the link below and you will be prompted to change your password.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/pages/auth/login" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Log In Now
                </a>
              </div>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                — The MyCareSight Team
              </p>
            </div>
          </body>
        </html>
      `,
      text: `Hi ${fullName},\n\n${agencyName ? `You have been invited to join ${agencyName} on MyCareSight.` : 'You have been invited to MyCareSight.'}\n\nYour temporary password is: ${tempPassword}\n\nLog in and change your password: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/pages/auth/login`,
    })
    return { success: true }
  } catch (error) {
    console.error('sendInvitationEmail error:', error)
    return { success: false, error }
  }
}

// ——— Existing notification emails ————————————————————————————————————————————

interface SendDocumentUploadNotificationParams {
  expertEmail: string
  expertName?: string
  ownerName?: string
  applicationName: string
  documentName: string
  applicationId: string
}

export async function sendDocumentUploadNotification({
  expertEmail,
  expertName,
  ownerName,
  applicationName,
  documentName,
  applicationId,
}: SendDocumentUploadNotificationParams) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const applicationUrl = `${appUrl}/pages/expert/applications/${applicationId}`

    await send({
      to: expertEmail,
      subject: `New Document Uploaded: ${documentName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">New Document Uploaded</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <p style="font-size: 16px; margin-bottom: 20px;">Hello ${expertName ?? 'Expert'},</p>
              <p style="font-size: 16px; margin-bottom: 20px;">${ownerName ? `${ownerName} has` : 'A client has'} uploaded a new document for the application:</p>
              <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1f2937;">${applicationName}</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">Document: <strong>${documentName}</strong></p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${applicationUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  View Application
                </a>
              </div>
              <p style="font-size: 14px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                This is an automated notification from MyCareSight.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `New Document Uploaded\n\nHello ${expertName ?? 'Expert'},\n\n${ownerName ? `${ownerName} has` : 'A client has'} uploaded a new document for the application: ${applicationName}\n\nDocument: ${documentName}\n\nView the application: ${applicationUrl}`,
    })
    return { success: true }
  } catch (error) {
    console.error('sendDocumentUploadNotification error:', error)
    return { success: false, error }
  }
}

export async function sendContactConfirmation({ to, firstName }: { to: string; firstName: string }) {
  try {
    await send({
      to,
      subject: 'Thanks for reaching out — MyCareSight',
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #0F172A; padding: 24px 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #22C55E; margin: 0; font-size: 22px;">MyCareSight</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <p style="font-size: 16px;">Hi ${firstName},</p>
              <p style="font-size: 16px;">Thank you for reaching out! We received your inquiry and will respond within 1–2 business days.</p>
              <p style="font-size: 14px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                — The MyCareSight Team
              </p>
            </div>
          </body>
        </html>
      `,
      text: `Hi ${firstName},\n\nThank you for reaching out! We received your inquiry and will respond within 1–2 business days.\n\n— The MyCareSight Team`,
    })
    return { success: true }
  } catch (error) {
    console.error('sendContactConfirmation error:', error)
    return { success: false }
  }
}

interface OnboardingEmailParams {
  to: string
  agencyName: string
  link: string
  expiresAt: string
  note?: string
}

export async function sendOnboardingLinkEmail({
  to,
  agencyName,
  link,
  expiresAt,
  note,
}: OnboardingEmailParams) {
  try {
    await send({
      to,
      subject: `Complete your agency setup — ${agencyName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(to right, #7c3aed, #4f46e5); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Agency Setup Invitation</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <p style="font-size: 16px; margin-bottom: 20px;">
                You have been invited to complete the setup for <strong>${agencyName}</strong> on the MyCareSight platform.
              </p>
              ${note ? `<p style="font-size: 15px; color: #4b5563; margin-bottom: 20px; padding: 12px 16px; background: white; border-left: 4px solid #7c3aed; border-radius: 0 8px 8px 0;">${note}</p>` : ''}
              <p style="font-size: 14px; color: #6b7280; margin-bottom: 24px;">
                Click the link below to fill out your agency information. This link expires on <strong>${expiresAt}</strong>.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Complete Agency Setup →
                </a>
              </div>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                This is an automated notification from MyCareSight. If you were not expecting this email, please ignore it.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `You have been invited to complete the setup for ${agencyName} on the MyCareSight platform.\n\n${note ? `${note}\n\n` : ''}Complete your agency setup here: ${link}\n\nThis link expires on ${expiresAt}.`,
    })
    return { success: true }
  } catch (error) {
    console.error('sendOnboardingLinkEmail error:', error)
    return { success: false, error }
  }
}
