const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withXcodeProject,
  withAppBuildGradle,
  withMainApplication,
  withInfoPlist,
  withAppDelegate,
} = require("@expo/config-plugins");

const IOS_SOURCE_DIR = "ios-native/GnhBackgroundSync";
const ANDROID_SOURCE_DIR = "android-native/GnhBackgroundSync";
const ANDROID_JAVA_PKG = "im/getnowhere/app/backgroundsync";
const ANDROID_TEST_PKG = "im/getnowhere/app/backgroundsync";

const WORKMANAGER_DEP =
  '    implementation("androidx.work:work-runtime-ktx:2.9.1")';
const WORKMANAGER_TEST_DEPS = `
    testImplementation("androidx.work:work-testing:2.9.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")`;

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

function withGnhBackgroundSyncIos(config) {
  config = withInfoPlist(config, (cfg) => {
    const ids = cfg.modResults.BGTaskSchedulerPermittedIdentifiers ?? [];
    if (!ids.includes("org.getnowhere.remote-node-refresh")) {
      cfg.modResults.BGTaskSchedulerPermittedIdentifiers = [
        ...ids,
        "org.getnowhere.remote-node-refresh",
      ];
    }
    const modes = cfg.modResults.UIBackgroundModes ?? [];
    if (!modes.includes("fetch")) {
      cfg.modResults.UIBackgroundModes = [...modes, "fetch"];
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosProjectRoot = cfg.modRequest.platformProjectRoot;
      const src = path.join(projectRoot, IOS_SOURCE_DIR);
      const dest = path.join(iosProjectRoot, "GnhBackgroundSync");
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
    const groupName = "GnhBackgroundSync";
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

  config = withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes("RemoteNodeBackgroundRefreshScheduler")) {
      return cfg;
    }
    if (!contents.includes("import BackgroundTasks")) {
      contents = contents.replace(
        /import Expo/,
        "import BackgroundTasks\nimport Expo",
      );
      if (!contents.includes("import BackgroundTasks")) {
        contents = `import BackgroundTasks\n${contents}`;
      }
    }
    contents = contents.replace(
      /func application\(\s*_ application: UIApplication,\s*didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\s*\) -> Bool \{/,
      `func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    RemoteNodeBackgroundRefreshScheduler.shared.registerBackgroundTasks()
    RemoteNodeBackgroundRefreshScheduler.shared.scheduleNextRefresh()`,
    );
    if (!contents.includes("applicationDidEnterBackground")) {
      contents = contents.replace(
        /\n\}\s*$/,
        `
  public override func applicationDidEnterBackground(_ application: UIApplication) {
    RemoteNodeBackgroundRefreshScheduler.shared.scheduleNextRefresh()
  }
}
`,
      );
    } else if (!contents.includes("RemoteNodeBackgroundRefreshScheduler")) {
      contents = contents.replace(
        /func applicationDidEnterBackground\([^)]*\)\s*\{/,
        (match) =>
          `${match}
    RemoteNodeBackgroundRefreshScheduler.shared.scheduleNextRefresh()`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

function withGnhBackgroundSyncAndroid(config) {
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
        ANDROID_TEST_PKG,
      );
      return cfg;
    },
  ]);

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("androidx.work:work-runtime-ktx")) {
      const marker = "// GNH_APP_VERSION_GRADLE";
      if (contents.includes(marker)) {
        contents = contents.replace(
          new RegExp(`\\n}\\s*\\n${marker.replace("/", "\\/")}`),
          `\n${WORKMANAGER_DEP}\n${WORKMANAGER_TEST_DEPS}\n}\n\n${marker}`,
        );
      } else {
        contents = contents.replace(
          /dependencies\s*\{/,
          `dependencies {\n${WORKMANAGER_DEP}\n${WORKMANAGER_TEST_DEPS}`,
        );
      }
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("GnhBackgroundSyncPackage")) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        "PackageList(this).packages.apply {\n          add(im.getnowhere.app.backgroundsync.GnhBackgroundSyncPackage())",
      );
    }
    if (!contents.includes("scheduleRemoteNodeBackgroundSync")) {
      contents = contents.replace(
        /ApplicationLifecycleDispatcher\.onApplicationCreate\(this\)/,
        `ApplicationLifecycleDispatcher.onApplicationCreate(this)
    im.getnowhere.app.backgroundsync.RemoteNodeBackgroundSyncScheduler.scheduleRemoteNodeBackgroundSync(this)`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

/** Expo config plugin: WorkManager + BGTaskScheduler remote-node background sync. */
function withGnhBackgroundSync(config) {
  config = withGnhBackgroundSyncAndroid(config);
  config = withGnhBackgroundSyncIos(config);
  return config;
}

module.exports = withGnhBackgroundSync;
