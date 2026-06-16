'use client'

import { useState, useEffect } from 'react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

const SERVICE_TYPES = [
  { key: 'non_skilled',            label: 'Non-Skilled' },
  { key: 'skilled_achc',           label: 'Skilled; ACHC Accredited' },
  { key: 'nurse_registry',         label: 'Nurse Registry' },
  { key: 'consulting_90_days',     label: '90 Days Consulting' },
  { key: 'resurvey_deficiencies',  label: '18 Resurvey Deficiencies' },
]

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide'

export default function ContactPage() {
  const [form, setForm] = useState({
    company: '', firstName: '', lastName: '',
    email: '', phone: '', bestTime: '',
    address1: '', address2: '',
    city: '', state: '', zip: '',
    serviceType: '', message: '',
    smsConsent: '',
    website: '', // honeypot — must stay empty
  })
  const [turnstileToken, setTurnstileToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Register global callback for Turnstile widget
    ;(window as unknown as Record<string, unknown>).__mcsContactCallback = (token: string) => {
      setTurnstileToken(token)
    }
  }, [])

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required.')
      return
    }
    if (!form.smsConsent) {
      setError('Please indicate your SMS preference.')
      return
    }
    if (!turnstileToken) {
      setError('Please wait for the security check to complete.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const resp = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, turnstileToken }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError('Connection error. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 24px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '40px 24px' }}>
          <h2 style={{ color: '#15803d', marginTop: 0 }}>Thank you for reaching out!</h2>
          <p style={{ color: '#166534', fontSize: 15 }}>
            We received your message and will respond within 1–2 business days.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, sans-serif', color: '#111' }}>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 24, lineHeight: 1.6 }}>
        We look forward to speaking with you and answering any questions you may have. Feel free to call us or fill out the form and it would be our pleasure to respond within 1–2 business days.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Honeypot — hidden from humans */}
        <input
          type="text"
          name="website"
          value={form.website}
          onChange={set('website')}
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          autoComplete="off"
        />

        <div style={{ marginBottom: 16 }}>
          <label className={labelCls} htmlFor="company">Company</label>
          <input id="company" className={inputCls} value={form.company} onChange={set('company')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label className={labelCls} htmlFor="firstName">First Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="firstName" className={inputCls} value={form.firstName} onChange={set('firstName')} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="lastName">Last Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="lastName" className={inputCls} value={form.lastName} onChange={set('lastName')} required />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label className={labelCls} htmlFor="email">Email <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="email" type="email" className={inputCls} value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" type="tel" className={inputCls} value={form.phone} onChange={set('phone')} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className={labelCls} htmlFor="bestTime">Best Time of Day to Contact</label>
          <input id="bestTime" className={inputCls} value={form.bestTime} onChange={set('bestTime')} placeholder="e.g. Morning, After 2pm…" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className={labelCls} htmlFor="address1">Address Line 1</label>
          <input id="address1" className={inputCls} value={form.address1} onChange={set('address1')} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className={labelCls} htmlFor="address2">Address Line 2</label>
          <input id="address2" className={inputCls} value={form.address2} onChange={set('address2')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label className={labelCls} htmlFor="city">City</label>
            <input id="city" className={inputCls} value={form.city} onChange={set('city')} />
          </div>
          <div>
            <label className={labelCls} htmlFor="state">State</label>
            <select id="state" className={inputCls} value={form.state} onChange={set('state')}>
              <option value="">—</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="zip">Zip Code</label>
            <input id="zip" className={inputCls} value={form.zip} onChange={set('zip')} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className={labelCls} htmlFor="serviceType">Service of Interest</label>
          <select id="serviceType" className={inputCls} value={form.serviceType} onChange={set('serviceType')}>
            <option value="">— Select —</option>
            {SERVICE_TYPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className={labelCls} htmlFor="message">Message</label>
          <textarea id="message" className={inputCls} rows={5} value={form.message} onChange={set('message')} style={{ resize: 'vertical' }} />
        </div>

        {/* SMS consent */}
        <div style={{ marginBottom: 20, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
            <input
              type="radio"
              name="smsConsent"
              value="yes"
              checked={form.smsConsent === 'yes'}
              onChange={set('smsConsent')}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <strong style={{ color: '#16a34a' }}>Yes, I agree to receive text (SMS) messages from MyCareSight.</strong>
              <br />
              <span style={{ color: '#4b5563' }}>
                By checking this box, I consent to receive SMS messages from MyCareSight regarding appointment reminders, care coordination updates, and general two-way communication. Message frequency varies. Message and data rates may apply. Reply HELP for assistance. No mobile information will be shared with third parties for marketing purposes. See our Privacy Policy and SMS Terms &amp; Conditions.
              </span>
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="smsConsent"
              value="no"
              checked={form.smsConsent === 'no'}
              onChange={set('smsConsent')}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <strong>No, I do not agree to receive text (SMS) messages from MyCareSight.</strong>
              <br />
              <span style={{ color: '#4b5563' }}>
                By checking this box, I understand that I will not receive SMS messages from MyCareSight regarding appointment reminders, care coordination updates, or other service-related communications. I understand that certain communications may instead be provided through phone calls, email, or other available methods.
              </span>
            </span>
          </label>
        </div>

        {/* Turnstile widget */}
        <div style={{ marginBottom: 20 }}>
          <div
            className="cf-turnstile"
            data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            data-callback="__mcsContactCallback"
          />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '13px',
            background: submitting ? '#9ca3af' : '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 15,
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            letterSpacing: '0.025em',
          }}
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
          <a href="#" style={{ fontSize: 12, color: '#6b7280' }}>SMS Privacy Policy</a>
          <a href="#" style={{ fontSize: 12, color: '#6b7280' }}>SMS Terms &amp; Conditions</a>
        </div>
      </form>
    </div>
  )
}
