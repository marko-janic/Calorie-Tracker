import { ExpoConfig, ConfigContext } from 'expo/config';
import * as fs from 'fs';
import * as path from 'path';

// Read version from repository root
const versionPath = path.join(__dirname, '..', 'VERSION');
const version = fs.readFileSync(versionPath, 'utf-8').trim();

// Parse version for versionCode (major*10000 + minor*100 + patch)
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kcal',
  slug: 'kcal',
  version,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true
  },
  android: {
    package: 'com.example.kcal',
    versionCode,
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_LOCAL_NETWORK'
    ]
  },
  web: {
    output: 'single',
    bundler: 'metro'
  },
  plugins: ['expo-router', 'expo-font', './plugins/withReleaseSigning.js'],
  experiments: {
    typedRoutes: true
  },
  scheme: 'kcal'
});
