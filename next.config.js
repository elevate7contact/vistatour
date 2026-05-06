/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ]
  },
  webpack: (config, { isServer }) => {
    // OpenCV.js intenta importar `fs` y `path` que son de Node. En cliente los marcamos como vacíos.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  }
};

module.exports = nextConfig;
