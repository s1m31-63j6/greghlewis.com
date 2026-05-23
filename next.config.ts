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
    NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL:
      process.env.NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL,
    NEXT_PUBLIC_ADVENTUREWORKS_TURNSTILE_SITEKEY:
      process.env.NEXT_PUBLIC_ADVENTUREWORKS_TURNSTILE_SITEKEY,
    // Flip to "true" once Fabric F2 quota is approved AND a PBI workspace
    // + report are authored. Until then the dashboard launch button stays
    // hidden — Vega-Lite charts cover the v1 visualisation story.
    NEXT_PUBLIC_ADVENTUREWORKS_PBI_ENABLED:
      process.env.NEXT_PUBLIC_ADVENTUREWORKS_PBI_ENABLED,
  },
};

export default nextConfig;
