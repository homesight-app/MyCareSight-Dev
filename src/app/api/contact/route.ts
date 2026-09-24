import { NextRequest, NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { sendContactConfirmation } from '@/lib/email'
import { publicContactSchema } from '@/lib/schemas/public-contact'
import { submitPublicContactLead } from '@/lib/repositories/public-contact'

export async function POST(request: NextRequest) {
  try {
    const parsed = publicContactSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 })
    }
    const body = parsed.data

    // Honeypot — bots fill this hidden field, humans don't
    if (body.website) {
      return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })
    }

    // Turnstile verification
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const turnstileOk = await verifyTurnstileToken(body.turnstileToken ?? '', ip)
    if (!turnstileOk.success) {
      return NextResponse.json({ error: 'Security check failed. Please try again.' }, { status: 400 })
    }

    // Required fields
    const result = await submitPublicContactLead(body)
    if (result.rateLimited) {
      return NextResponse.json(
        { error: 'Too many submissions from this email. Please contact us directly.' },
        { status: 429 }
      )
    }

    if (!result.accepted) {
      return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 })
    }

    try {
      await sendContactConfirmation({ to: body.email, firstName: body.firstName })
    } catch {
      // The lead is already committed; email delivery can be retried operationally.
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Contact API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
