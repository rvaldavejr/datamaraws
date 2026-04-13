import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Mapbox GL needs these browser globals suppressed in SSR
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    }
    return config
  },
}

export default nextConfig