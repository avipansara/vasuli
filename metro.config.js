const path = require('node:path');
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

// Derive through PostHog's helper so source-map support is wired for EAS
// Build uploads (phase two); Vasuli's custom behavior is reapplied below.
const config = getPostHogExpoConfig(__dirname);

if (process.env.VASULI_PRODUCTION_METRO === '1') {
  // SDK 57's virtual env module merges .env files over process.env during HMR,
  // independently of EXPO_NO_DOTENV. The production launcher already supplies
  // the selected public variables, so hide env files from its module graph.
  const envPath = path.join(__dirname, '.env').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    new RegExp(`^${envPath}(?:\\..*)?$`),
  ];
}

module.exports = config;
