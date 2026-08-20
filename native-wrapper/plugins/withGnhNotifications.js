const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withXcodeProject,
  withMainApplication,
} = require("@expo/config-plugins");

const IOS_SOURCE_DIR = "ios-native/GnhNotifications";
const ANDROID_SOURCE_DIR = "android-native/GnhNotifications";
const ANDROID_JAVA_PKG = "im/getnowhere/app/notifications";

function copyKotlinSources(projectRoot, platformProjectRoot, subdir) {
  const src = path.join(projectRoot, ANDROID_SOURCE_DIR);
  const dest = path.join(
    platformProjectRoot,
    subdir,
    "java",
    ...ANDROID_JAVA_PKG.split("/"),
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

function withGnhNotificationsAndroid(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      copyKotlinSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/main",
      );
      copyKotlinSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
        "app/src/test",
      );
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("GnhNotificationsPackage")) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        "PackageList(this).packages.apply {\n          add(im.getnowhere.app.notifications.GnhNotificationsPackage())",
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

function withGnhNotificationsIos(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosProjectRoot = cfg.modRequest.platformProjectRoot;
      const src = path.join(projectRoot, IOS_SOURCE_DIR);
      const dest = path.join(iosProjectRoot, "GnhNotifications");
      if (!fs.existsSync(src)) return cfg;
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        if (name.endsWith(".swift") || name.endsWith(".m")) {
          fs.copyFileSync(path.join(src, name), path.join(dest, name));
        }
      }
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const src = path.join(projectRoot, IOS_SOURCE_DIR);
    if (!fs.existsSync(src)) return cfg;
    const project = cfg.modResults;
    const groupName = "GnhNotifications";
    const group = project.pbxCreateGroup(groupName);
    const target = project.getFirstTarget().uuid;
    for (const name of fs.readdirSync(src)) {
      if (!name.endsWith(".swift") && !name.endsWith(".m")) continue;
      if (name.endsWith("Tests.swift")) continue;
      const filePath = path.join(groupName, name);
      project.addSourceFile(filePath, { target }, group);
    }
    project.addToPbxGroup(
      group,
      project.getFirstProject().firstProject.mainGroup,
    );
    return cfg;
  });

  return config;
}

/** Expo config plugin: GnhNotifications local-notification native module. */
function withGnhNotifications(config) {
  config = withGnhNotificationsAndroid(config);
  config = withGnhNotificationsIos(config);
  return config;
}

module.exports = withGnhNotifications;
