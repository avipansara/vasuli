const path = require('node:path');

module.exports = function configureBabel(api) {
  api.cache(true);

  // Expo Router's generated context uses this value during native release
  // bundling, including the expo-updates Xcode build phase.
  process.env.EXPO_ROUTER_APP_ROOT = path.join(__dirname, 'app');

  return {
    presets: ['babel-preset-expo'],
  };
};
