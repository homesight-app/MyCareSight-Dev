export async function verifyTurnstileToken(token: string, ip: string): Promise<{ success: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification')
    return { success: true }
  }
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const data = await resp.json()
    return { success: data.success === true }
  } catch {
    return { success: false }
  }
}
