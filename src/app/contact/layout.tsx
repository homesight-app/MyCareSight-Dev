import Script from 'next/script'

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
    </>
  )
}
