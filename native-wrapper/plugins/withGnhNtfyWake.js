const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withAppBuildGradle,
  withMainApplication,
} = require("@expo/config-plugins");

const ANDROID_SOURCE_DIR = "android-native/GnhNtfyWake";
const ANDROID_JAVA_PKG = "im/getnowhere/app/ntfywake";

const OKHTTP_SSE_DEP =
  '    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")';

function copyKotlinSources(projectRoot, platformProjectRoot, subdir, pkg) {
  const src = path.join(projectRoot, ANDROID_SOURCE_DIR);
  const dest = path.join(
    platformProjectRoot,
    subdir,
    "java",
    ...pkg.split("/"),
  );
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith(".kt")) continue;
    if (subdir.includes("test") && !name.endsWith("Test.kt")) continue;
    if (subdir.includes("main") && name.endsWith("Test.kt")) continue;
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
  }
}

/** Expo config plugin: ntfy SSE peer-wake module (Android / F-Droid only). */
function withGnhNtfyWake(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      copyKotlinSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/main",
        ANDROID_JAVA_PKG,
      );
      copyKotlinSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/test",
        ANDROID_JAVA_PKG,
      );
      return cfg;
    },
  ]);

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("com.squareup.okhttp3:okhttp-sse")) {
      const marker = "// GNH_APP_VERSION_GRADLE";
      if (contents.includes(marker)) {
        contents = contents.replace(
          new RegExp(`\\n}\\s*\\n${marker.replace("/", "\\/")}`),
          `\n${OKHTTP_SSE_DEP}\n}\n\n${marker}`,
        );
      } else {
        contents = contents.replace(
          /dependencies\s*\{/,
          `dependencies {\n${OKHTTP_SSE_DEP}`,
        );
      }
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("GnhNtfyWakePackage")) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        "PackageList(this).packages.apply {\n          add(im.getnowhere.app.ntfywake.GnhNtfyWakePackage())",
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withGnhNtfyWake;
