import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        assert: false,
        module: false,
        worker_threads: false,
      }
    }

    return config
  },
}

export default nextConfig
