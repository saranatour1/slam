import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/core/convex.config.js";
import passwordProvider from "@convex-dev/auth/providers/password/convex.config.js";
import username from "@convex-dev/auth/username/convex.config.js";
import anonymous from "@convex-dev/auth/providers/anonymous/convex.config.js";
import shardedCounter from "@convex-dev/sharded-counter/convex.config.js";

const app = defineApp({
  env: {
    // Convex Auth v2 signing keys (set by `npx @convex-dev/auth`).
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    // Cloudflare Email Sending (REST API). Optional until you want email exports.
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
    // Linear (personal API key). Optional until you want Linear exports.
    LINEAR_API_KEY: v.optional(v.string()),
    LINEAR_TEAM_ID: v.optional(v.string()),
    // TypeSafe System One (Jev) — Jeff idea judgments. Optional until configured.
    TYPESAFE_API_KEY: v.optional(v.string()),
    // Public URL of the web app, used in export links.
    SITE_URL: v.optional(v.string()),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
// Creator signs in with username + password.
app.use(passwordProvider);
app.use(username);
// Everyone else is anonymous.
app.use(anonymous);
// High-throughput vote / poll tallies.
app.use(shardedCounter);

export default app;
