const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Allow importing CJS files from the native example
    config.resolve.alias = {
      ...config.resolve.alias,
      '@example': path.resolve(__dirname, '../example/server/src'),
    };
    return config;
  },
  // Allow importing source files from outside this directory
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
