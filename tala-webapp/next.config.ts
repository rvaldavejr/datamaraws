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
  turbopack: {},
  //output: 'export',   // generates static files in /out
  //trailingSlash: true,
}

export default nextConfig