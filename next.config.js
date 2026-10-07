const azureStorageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim()

/** @type {import('next').NextConfig} */
const nextConfig = {

  output: 'standalone',

  serverExternalPackages: ['pdf-parse', 'mammoth'],

  // Reuse recently visited dynamic page segments in this browser tab. Server
  // actions invalidate affected paths immediately; this short upper bound
  // protects routes whose data can also change outside the current session.
  experimental: {
    // Requests passing through middleware are cloned in memory. Keep this
    // above the 10 MB application upload limit to allow multipart overhead.
    middlewareClientMaxBodySize: '12mb',
    staleTimes: {
      dynamic: 30,
    },
  },

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
      ...(azureStorageAccountName
        ? [{
            protocol: 'https',
            hostname: `${azureStorageAccountName}.blob.core.windows.net`,
            pathname: '/**',
          }]
        : []),
    ]
  },

}

module.exports = nextConfig
