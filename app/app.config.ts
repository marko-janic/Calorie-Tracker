import { ExpoConfig, ConfigContext } from 'expo/config';
import * as fs from 'fs';
import * as path from 'path';

// Read version from repository root
const versionPath = path.join(__dirname, '..', 'VERSION');
const version = fs.readFileSync(versionPath, 'utf-8').trim();

// Parse version for versionCode (major*10000 + minor*100 + patch)
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

// Pull request builds (KCAL_APP_VARIANT=pr, set by pr-apk.yml) get their own application ID and
// label. They install next to the release app instead of trying to replace it with another key.
const isPullRequestBuild = () => process.env.KCAL_APP_VARIANT === 'pr';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isPullRequestBuild() ? 'Kcal PR' : 'Kcal',
  slug: 'kcal',
  version,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true
  },
  android: {
    package: isPullRequestBuild() ? 'cloud.janic.kcal.pr' : 'cloud.janic.kcal',
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
  plugins: [
    'expo-router',
    'expo-font',
    ['expo-camera', { cameraPermission: 'Kcal uses the camera to scan product barcodes.', recordAudioAndroid: false }],
    './plugins/withReleaseSigning.js'
  ],
  experiments: {
    typedRoutes: true
  },
  scheme: 'kcal'
});
