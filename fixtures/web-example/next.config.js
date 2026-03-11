const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, '../..'),
    resolveAlias: {
      '@example/*': '../example/server/src/*',
    },
  },
  // Allow importing source files from outside this directory
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
