import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Edge runtime for API routes where possible
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Web analytics
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
        ],
      },
    ]
  },
}

export default nextConfig
