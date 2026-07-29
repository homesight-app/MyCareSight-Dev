/** @type {import('next').NextConfig} */
const nextConfig = {

  serverExternalPackages: ['pdf-parse', 'mammoth'],

  reactStrictMode: true,
  async headers() {
    return [
      {
        // Allow the /contact page to be iFramed from any origin (WordPress embed)
        source: '/contact',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ]
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/**' },
      { protocol: 'https', hostname: '*.supabase.in', pathname: '/**' }
    ]
  },

}

module.exports = nextConfig
