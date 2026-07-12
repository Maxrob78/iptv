/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // On désactive le mode strict pour éviter les double-appels de hooks
  swcMinify: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
}

module.exports = nextConfig
