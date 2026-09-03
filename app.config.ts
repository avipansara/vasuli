import { ConfigContext, ExpoConfig } from 'expo/config';
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
  const plugins = config.plugins ?? [];
  const productionPlugins = isDev || isPreview
    ? plugins
    : [
        ...plugins,
        [
          'expo-build-properties',
          {
            android: {
              // x86 targets are only needed for emulators and add native build time.
              buildArchs: ['armeabi-v7a', 'arm64-v8a'],
            },
          },
        ],
      ];

  // Resolve google-services.json file paths dynamically (e.g. from EAS Secret path or default local path)
  const prodGoogleServices = './google-services.json';
  const googleServicesFile = process.env.GOOGLE_SERVICES_FIREBASE_JSON || prodGoogleServices;

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
    plugins: productionPlugins,
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
      },
    },
  } as ExpoConfig;
};
