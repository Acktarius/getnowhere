const GNH_SYNC_SECURITY_NATIVE_MARKER = "// GNH_SYNC_SECURITY_NATIVE";

/** Gradle: copy android-native on every assemble so prebuild-only copies cannot go stale. */
const GNH_SYNC_SECURITY_NATIVE_GRADLE = `
${GNH_SYNC_SECURITY_NATIVE_MARKER}
def gnhSecurityNativeDir = new File(rootDir, "../android-native/GnhSecurity")
if (gnhSecurityNativeDir.directory) {
    tasks.register("syncGnhSecurityNativeSources", Copy) {
        from(gnhSecurityNativeDir) {
            include("*.kt")
            exclude("*Test.kt")
        }
        into("src/main/java/im/getnowhere/app/security")
    }
    tasks.register("syncGnhSecurityNativeTests", Copy) {
        from(gnhSecurityNativeDir) {
            include("*Test.kt")
        }
        into("src/test/java/im/getnowhere/app/security")
    }
    tasks.register("syncGnhSecurityNativeXml", Copy) {
        from(new File(gnhSecurityNativeDir, "xml")) {
            include("*.xml")
        }
        into("src/main/res/xml")
    }
    tasks.named("preBuild").configure {
        dependsOn(
            "syncGnhSecurityNativeSources",
            "syncGnhSecurityNativeTests",
            "syncGnhSecurityNativeXml",
        )
    }
}
`;

function applyGnhSecurityNativeSync(contents) {
  if (contents.includes(GNH_SYNC_SECURITY_NATIVE_MARKER)) return contents;
  return `${contents.trimEnd()}\n${GNH_SYNC_SECURITY_NATIVE_GRADLE}\n`;
}

module.exports = {
  applyGnhSecurityNativeSync,
  GNH_SYNC_SECURITY_NATIVE_MARKER,
};
