import type { NextConfig } from "next";

/**
 * Where the FastAPI backend lives. Read at build/start time on the server only —
 * deliberately not `NEXT_PUBLIC_`, because the browser never needs to know: it
 * calls `/api/*` on its own origin and the rewrite below does the forwarding.
 */
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  /* config options here */

  /**
   * Development only: proxies /api/* to the uvicorn process started by
   * `npm run dev:api`, so every request the browser makes is same-origin. That
   * keeps CORS out of the picture in the browser entirely, and means no API URL
   * has to be baked into the client bundle.
   *
   * On Vercel this must return nothing. There is no uvicorn there — the same
   * FastAPI app runs as the Python function in api/index.py, and vercel.json
   * routes /api/* to it. Leaving the rewrite in place would point the deployed
   * site at `http://localhost:8000` and every request would fail.
   *
   * The guard keys off VERCEL, not NODE_ENV, and that distinction is the whole
   * point. `next build` and `next start` both run with NODE_ENV=production, and
   * rewrites are baked into routes-manifest.json at build time — so a NODE_ENV
   * check also strips the rewrite from a local production build, leaving
   * `npm run start` serving a UI whose every API call 404s with nothing local
   * standing in for vercel.json. VERCEL is set only in Vercel's build and
   * runtime environments, which is exactly where vercel.json takes over.
   */
  async rewrites() {
    if (process.env.VERCEL) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },

    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },

};

export default nextConfig;
