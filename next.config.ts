import type { NextConfig } from "next";

// Amplify Hosting (WEB_COMPUTE platform) exposes app-level environment
// variables at BUILD time only — they don't automatically propagate to
// the SSR runtime Lambda. Re-exporting them through `env` here bakes the
// build-time values into the server bundle so `process.env.X` reads in
// route handlers see them at request time.
const nextConfig: NextConfig = {
  env: {
    NFLCOMPARABLES_KB_ID: process.env.NFLCOMPARABLES_KB_ID,
    NFLCOMPARABLES_AWS_ACCOUNT: process.env.NFLCOMPARABLES_AWS_ACCOUNT,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
};

export default nextConfig;
