/** @type {import('next').NextConfig} */
const apiBase = process.env.API_INTERNAL_URL || (process.env.NODE_ENV === 'production' ? 'http://api:8000' : 'http://127.0.0.1:8000');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
