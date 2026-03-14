/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for wagmi SSR
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

module.exports = nextConfig;
