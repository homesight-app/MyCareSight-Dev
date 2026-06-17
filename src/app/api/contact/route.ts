import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { sendContactConfirmation } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

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
    const firstName = body.firstName?.trim() ?? ''
    const lastName = body.lastName?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: 'First name, last name, and email are required.' }, { status: 400 })
    }

    // Rate limit: max 3 submissions per email in 24 hours
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('contact_email', email)
      .eq('source', 'Website')
      .gte('created_at', since)

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Too many submissions from this email. Please contact us directly.' },
        { status: 429 }
      )
    }

    // Build notes block
    const noteLines: string[] = ['[Website Contact Form]']
    if (body.bestTime?.trim()) noteLines.push(`Best Time to Call: ${body.bestTime.trim()}`)
    if (body.message?.trim()) {
      noteLines.push('---')
      noteLines.push(body.message.trim())
    }

    // Create lead
    const { error: insertError } = await supabase.from('leads').insert({
      lead_type: 'agency',
      contact_first_name: firstName,
      contact_last_name: lastName,
      contact_email: email,
      contact_phone: body.phone?.trim() || null,
      company_name: body.company?.trim() || null,
      service_type: body.serviceType || null,
      stage: 'new',
      status: 'active',
      source: 'Website',
      sms_consent: body.smsConsent === 'yes' ? true : body.smsConsent === 'no' ? false : null,
      contact_address1: body.address1?.trim() || null,
      contact_address2: body.address2?.trim() || null,
      contact_city: body.city?.trim() || null,
      contact_state: body.state?.trim() || null,
      contact_zip: body.zip?.trim() || null,
      notes: noteLines.join('\n'),
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error('Contact form lead insert error:', insertError)
      return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 })
    }

    await sendContactConfirmation({ to: email, firstName })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Contact API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
