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
   * Proxies /api/* to the FastAPI app, so every request the browser makes is
   * same-origin. That keeps CORS out of the picture in the browser entirely,
   * and means no API URL has to be baked into the client bundle.
   */
  async rewrites() {
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
