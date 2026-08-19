import { ExpoConfig, ConfigContext } from 'expo/config';
import fs from 'fs';
import path from 'path';

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV || 'production';
  const isDev = appEnv === 'development';
  const isPreview = appEnv === 'preview';

  // Dynamic values based on APP_ENV
  const name = isDev ? 'Vasuli Dev' : isPreview ? 'Vasuli Preview' : 'Vasuli';
  
  const bundleIdentifier = isDev
    ? 'com.avipansara.vasuli.dev'
    : isPreview
    ? 'com.avipansara.vasuli.preview'
    : 'com.avipansara.vasuli';

  const package_ = bundleIdentifier;

  // Resolve google-services.json file paths dynamically (fallback to default if environment-specific one doesn't exist)
  const devGoogleServices = './google-services.development.json';
  const prodGoogleServices = './google-services.json';
  const googleServicesFile = (isDev && fs.existsSync(path.resolve(__dirname, devGoogleServices)))
    ? devGoogleServices
    : prodGoogleServices;

  return {
    ...config,
    name,
    ios: {
      ...config.ios,
      bundleIdentifier,
    },
    android: {
      ...config.android,
      package: package_,
      googleServicesFile,
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
      },
    },
  } as ExpoConfig;
};
