const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// kcal: release signing';

const RELEASE_SIGNING_CONFIG = `
        ${MARKER}
        release {
            if (kcalReleaseSigning) {
                storeFile file(System.getenv('KCAL_UPLOAD_STORE_FILE'))
                storePassword System.getenv('KCAL_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('KCAL_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('KCAL_UPLOAD_KEY_PASSWORD')
            }
        }`;

const RELEASE_SIGNING_FLAG = `${MARKER}: the KCAL_UPLOAD_* variables are read when Gradle runs, not at prebuild.
def kcalReleaseSigning = ['KCAL_UPLOAD_STORE_FILE', 'KCAL_UPLOAD_STORE_PASSWORD', 'KCAL_UPLOAD_KEY_ALIAS', 'KCAL_UPLOAD_KEY_PASSWORD']
    .every { System.getenv(it) }
`;

const ANDROID_BLOCK_ANCHOR = /^android\s*\{/m;
const SIGNING_CONFIGS_ANCHOR = /signingConfigs\s*\{/;
const RELEASE_BUILD_TYPE_SIGNING = /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/;

/**
 * Adds `signingConfigs.release` to android/app/build.gradle (section 9.4).
 *
 * The release build type uses it when all KCAL_UPLOAD_* environment variables are set
 * and falls back to debug signing otherwise (local builds). The release workflow fails
 * before Gradle runs if the signing secrets are missing.
 *
 * Throws if the generated build.gradle no longer has the expected shape, so a changed
 * Expo template breaks the build instead of silently shipping debug-signed APKs.
 */
function applyReleaseSigning(buildGradle) {
  if (buildGradle.includes(MARKER)) {
    return buildGradle;
  }
  const anchors = [ANDROID_BLOCK_ANCHOR, SIGNING_CONFIGS_ANCHOR, RELEASE_BUILD_TYPE_SIGNING];
  if (!anchors.every((anchor) => anchor.test(buildGradle))) {
    throw new Error('withReleaseSigning: android/app/build.gradle has an unexpected layout');
  }

  const withFlag = buildGradle.replace(ANDROID_BLOCK_ANCHOR, (match) => `${RELEASE_SIGNING_FLAG}${match}`);
  const withConfig = withFlag.replace(
    SIGNING_CONFIGS_ANCHOR,
    (match) => `${match}${RELEASE_SIGNING_CONFIG}`
  );
  const withBuildType = withConfig.replace(
    RELEASE_BUILD_TYPE_SIGNING,
    '$1signingConfig kcalReleaseSigning ? signingConfigs.release : signingConfigs.debug'
  );
  return withBuildType;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only a Groovy build.gradle is supported');
    }
    config.modResults.contents = applyReleaseSigning(config.modResults.contents);
    return config;
  });
}

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
