const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withXcodeProject,
  withAppBuildGradle,
  withMainApplication,
  withMainActivity,
  withAndroidManifest,
} = require("@expo/config-plugins");
const { applyGnhSecurityNativeSync } = require("./gnhSecurityNativeSync");

const IOS_SOURCE_DIR = "ios-native/GnhSecurity";
const ANDROID_SOURCE_DIR = "android-native/GnhSecurity";
const ANDROID_JAVA_PKG = "im/getnowhere/app/security";

const BIOMETRIC_DEPS = `
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")`;

/** Copy committed Kotlin sources into the generated android/ tree. */
function copyAndroidSecuritySources(projectRoot, platformProjectRoot, subdir) {
  const src = path.join(projectRoot, ANDROID_SOURCE_DIR);
  const dest = path.join(platformProjectRoot, subdir, "java", ANDROID_JAVA_PKG);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith(".kt")) continue;
    if (subdir.includes("test") && !name.endsWith("Test.kt")) continue;
    if (subdir.includes("main") && name.endsWith("Test.kt")) continue;
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
  }
}

function copyAndroidBackupXml(projectRoot, platformProjectRoot) {
  const srcDir = path.join(projectRoot, ANDROID_SOURCE_DIR, "xml");
  const destDir = path.join(platformProjectRoot, "app/src/main/res/xml");
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".xml")) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}

/** iOS: copy Swift/ObjC into Xcode project on prebuild. */
function withGnhSecurityIos(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosProjectRoot = cfg.modRequest.platformProjectRoot;
      const src = path.join(projectRoot, IOS_SOURCE_DIR);
      const dest = path.join(iosProjectRoot, "GnhSecurity");
      if (!fs.existsSync(src)) return cfg;
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        if (name === "README.md") continue;
        fs.copyFileSync(path.join(src, name), path.join(dest, name));
      }
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const src = path.join(projectRoot, IOS_SOURCE_DIR);
    if (!fs.existsSync(src)) return cfg;
    const project = cfg.modResults;
    const groupName = "GnhSecurity";
    const group = project.pbxCreateGroup(groupName);
    const target = project.getFirstTarget().uuid;
    for (const name of fs.readdirSync(src)) {
      if (name === "README.md") continue;
      const filePath = path.join(groupName, name);
      if (name.endsWith(".swift") || name.endsWith(".m")) {
        project.addSourceFile(filePath, { target }, group);
      }
    }
    project.addToPbxGroup(
      group,
      project.getFirstProject().firstProject.mainGroup,
    );
    return cfg;
  });

  return config;
}

/** Android: copy Kotlin, Gradle deps, MainApplication package, FLAG_SECURE. */
function withGnhSecurityAndroid(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      copyAndroidSecuritySources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/main",
      );
      copyAndroidSecuritySources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/test",
      );
      copyAndroidBackupXml(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
      );
      return cfg;
    },
  ]);

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("androidx.biometric:biometric")) {
      return cfg;
    }
    const marker = "// GNH_APP_VERSION_GRADLE";
    if (cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        new RegExp(`\\n}\\s*\\n${marker.replace("/", "\\/")}`),
        `\n${BIOMETRIC_DEPS}\n}\n\n${marker}`,
      );
    } else {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {${BIOMETRIC_DEPS}`,
      );
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyGnhSecurityNativeSync(
      cfg.modResults.contents,
    );
    return cfg;
  });

  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.contents.includes("GnhSecurityPackage")) {
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      "PackageList(this).packages.apply {\n          add(im.getnowhere.app.security.GnhSecurityPackage())",
    );
    return cfg;
  });

  config = withMainActivity(config, (cfg) => {
    if (cfg.modResults.contents.includes("FLAG_SECURE")) {
      return cfg;
    }
    const flagBlock = `
    window.setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE,
    )`;
    if (cfg.modResults.contents.includes("super.onCreate(null)")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        "super.onCreate(null)",
        `super.onCreate(null)${flagBlock}`,
      );
    } else {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /super\.onCreate\([^)]*\)/,
        (match) => `${match}${flagBlock}`,
      );
    }
    if (
      !cfg.modResults.contents.includes("import android.view.WindowManager")
    ) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /import android\.os\.Bundle/,
        "import android.os.Bundle\nimport android.view.WindowManager",
      );
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.$ = app.$ ?? {};
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "@xml/gnh_backup_rules";
    app.$["android:dataExtractionRules"] = "@xml/gnh_data_extraction_rules";
    return cfg;
  });

  return config;
}

/** Expo config plugin: inject GnhSecurity native modules (Android + iOS). */
function withGnhSecurity(config) {
  config = withGnhSecurityAndroid(config);
  config = withGnhSecurityIos(config);
  return config;
}

module.exports = withGnhSecurity;
