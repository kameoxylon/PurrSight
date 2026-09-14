import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the dev-only Next.js Devtools indicator (the "N" panel). Dev-only;
  // it never appears in production builds regardless of this setting.
  devIndicators: false,

  // Produces a self-contained server bundle at .next/standalone (server.js +
  // a traced, minimal node_modules). Azure App Service (Linux/Node) runs it
  // with `node server.js`, which is smaller and cold-starts faster than
  // shipping the full repo + `next start`.
  output: "standalone",
};

export default nextConfig;
