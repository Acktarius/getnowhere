/**
 * iOS-only: copy assets/ui into the app bundle at Xcode build time (preserves tree).
 * Android / F-Droid unchanged. @see docs/builds/expo-eas-ios-build.md
 */
const { withXcodeProject } = require("@expo/config-plugins");

const PHASE_NAME = "Copy GNH WebView UI";

/** Shell script body (newlines escaped for pbxproj). */
const COPY_UI_SCRIPT = [
  "set -e",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'UI_SRC="${SRCROOT}/../assets/ui"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'UI_DST="${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/ui"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'if [ ! -f "${UI_SRC}/index.html" ]; then',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  '  echo "error: missing ${UI_SRC}/index.html — run npm run mobile:sync-ui before eas build" >&2',
  "  exit 1",
  "fi",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'rm -rf "${UI_DST}"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'mkdir -p "${UI_DST}"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'cp -R "${UI_SRC}/." "${UI_DST}/"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable, not a JS template literal
  'echo "Copied WebView UI → ${UI_DST}"',
].join("\\n");

function hasCopyUiPhase(project) {
  const section = project.hash.project.objects.PBXShellScriptBuildPhase || {};
  return Object.values(section).some(
    (phase) =>
      phase &&
      typeof phase === "object" &&
      typeof phase.name === "string" &&
      phase.name.includes(PHASE_NAME),
  );
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withGnhIosUiBundle(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (hasCopyUiPhase(project)) return cfg;
    project.addBuildPhase(
      [],
      "PBXShellScriptBuildPhase",
      PHASE_NAME,
      project.getFirstTarget().uuid,
      {
        shellPath: "/bin/sh",
        shellScript: COPY_UI_SCRIPT,
      },
    );
    return cfg;
  });
}

module.exports = withGnhIosUiBundle;
