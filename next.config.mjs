/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'commons.wikimedia.org',
        pathname: '/wiki/Special:FilePath/**',
      },
    ],
  },
};
export default nextConfig;
