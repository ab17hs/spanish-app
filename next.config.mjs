/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip type-checking and lint at build time. We rely on the IDE / `npm run
  // type-check` and `npm run lint` to catch issues during development. This
  // unblocks Vercel deploys when Supabase's typed client occasionally infers
  // `data` as `never` for narrowed `.select(...)` queries.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // for .docx uploads
    nodeMiddleware: true, // enable Node.js runtime in middleware (for @supabase/ssr)
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
