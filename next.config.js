const azureStorageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim()

/** @type {import('next').NextConfig} */
const nextConfig = {

  output: 'standalone',

  serverExternalPackages: ['pdf-parse', 'mammoth'],

  // Disable client-side router cache so navigating to a page always fetches
  // fresh server data. Without this, Next.js 15 caches rendered pages on the
  // client for 30 s, causing stale data after server-side mutations.
  experimental: {
    staleTimes: {
      dynamic: 0,
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
