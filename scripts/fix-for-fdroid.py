#!/usr/bin/env python3
"""
F-Droid build fixes for Get NowHere Android (Expo bare workflow).

Run this AFTER `npx expo prebuild --platform android` and BEFORE
`./gradlew assembleRelease`. It removes Google Play Services / Firebase /
MLKit transitive dependencies and non-free Maven repos so the resulting
unsigned APK is acceptable to F-Droid.

Usage:
    python3 scripts/fix-for-fdroid.py
"""

import re
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ANDROID_DIR = PROJECT_ROOT / "native-wrapper" / "android"
if not ANDROID_DIR.exists():
    ANDROID_DIR = PROJECT_ROOT / "android"

FORBIDDEN_KEYWORDS = [
    "com.google.android.gms",
    "com.google.firebase",
    "com.google.mlkit",
    "play-services",
    "firebase",
    "barcode-scanning",
    "camera--vision",
]

GOOGLE_MAVEN_URL = "https://dl.google.com/dl/android/maven2/"
EXPO_MAVEN_URL = "https://expo.dev/artifacts/public/maven"


def log(msg: str) -> None:
    print(f"  {msg}")


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_file(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def replace_in_file(path: Path, pattern: str, replacement: str, flags: int = 0) -> bool:
    content = read_file(path)
    new_content = re.sub(pattern, replacement, content, flags=flags)
    if new_content != content:
        write_file(path, new_content)
        return True
    return False


def remove_google_maven_repo(content: str) -> str:
    lines = content.splitlines()
    kept = []
    skip_block = False
    block_lines = []
    for line in lines:
        stripped = line.strip()
        if skip_block:
            block_lines.append(line)
            if stripped.endswith("}"):
                block_text = "\n".join(block_lines)
                if GOOGLE_MAVEN_URL not in block_text and EXPO_MAVEN_URL not in block_text:
                    kept.extend(block_lines)
                skip_block = False
                block_lines = []
            continue
        if stripped.startswith("maven {") and not stripped.endswith("}"):
            skip_block = True
            block_lines = [line]
            continue
        if GOOGLE_MAVEN_URL in line:
            line = line.replace(GOOGLE_MAVEN_URL, "")
            line = re.sub(r"maven\s*\{\s*url\s*\"[^\"]*\"\s*\}", "", line)
        if "maven { url" in line and EXPO_MAVEN_URL in line:
            line = re.sub(r"maven\s*\{\s*url\s*\"[^\"]*\"\s*\}", "", line)
        kept.append(line)
    return "\n".join(kept)


def strip_google_dependencies(content: str) -> str:
    lines = content.splitlines()
    kept = []
    for line in lines:
        stripped = line.strip()
        if any(kw in line for kw in FORBIDDEN_KEYWORDS):
            if any(stripped.startswith(prefix) for prefix in (
                "implementation", "api", "compileOnly", "runtimeOnly",
                "testImplementation", "debugImplementation",
            )):
                log(f"    removed: {stripped[:90]}")
                continue
        kept.append(line)
    return "\n".join(kept)


def add_global_exclusions(content: str) -> str:
    marker = "configurations.all {"
    if marker in content and 'exclude group: "com.google.android.gms"' in content:
        return content

    exclusion_block = """
    configurations.all {
        exclude group: "com.google.android.gms"
        exclude group: "com.google.firebase"
        exclude group: "com.google.mlkit"
    }
"""
    if "dependencies {" in content:
        content = content.replace("dependencies {", "dependencies {" + exclusion_block, 1)
    return content


def add_packaging_options(content: str) -> str:
    if "packagingOptions {" in content:
        content = re.sub(
            r"(packagingOptions \{)",
            r"""\1
        exclude '**/com/google/android/gms/**'
        exclude '**/com/google/firebase/**'
        exclude '**/com/google/mlkit/**'""",
            content,
            count=1,
        )
        return content

    block = """
    packagingOptions {
        exclude '**/com/google/android/gms/**'
        exclude '**/com/google/firebase/**'
        exclude '**/com/google/mlkit/**'
    }
"""
    content = content.replace("android {", "android {" + block, 1)
    return content


def remove_problematic_repos(content: str) -> str:
    content = re.sub(r"mavenLocal\(\)", "", content)
    content = re.sub(r"flatDir\s*\{[^}]*\}", "", content, flags=re.DOTALL)
    content = re.sub(r"maven\s*\{\s*url\s*\"file://[^\"]*\"\s*\}", "", content)
    return content


def fix_gradle_files() -> None:
    if not ANDROID_DIR.exists():
        log("android/ directory not found. Run `npx expo prebuild --platform android` first.")
        sys.exit(1)

    candidates = list(ANDROID_DIR.rglob("build.gradle")) + list(ANDROID_DIR.rglob("build.gradle.kts"))
    if not candidates:
        log("No build.gradle files found under android/.")
        sys.exit(1)

    for gradle_path in candidates:
        rel = gradle_path.relative_to(ANDROID_DIR)
        content = read_file(gradle_path)

        original = content

        content = remove_google_maven_repo(content)
        content = strip_google_dependencies(content)
        content = remove_problematic_repos(content)

        if gradle_path.name == "build.gradle" and gradle_path.parent.name == "app":
            content = add_global_exclusions(content)
            content = add_packaging_options(content)

        if content != original:
            write_file(gradle_path, content)
            log(f"patched {rel}")


def clean_local_maven_repos() -> None:
    for local_repo in PROJECT_ROOT.glob("node_modules/*/local-maven-repo"):
        if local_repo.is_dir():
            shutil.rmtree(local_repo, ignore_errors=True)


def main() -> None:
    print("F-Droid fixes for Get NowHere Android")
    print("=" * 50)

    fix_gradle_files()
    clean_local_maven_repos()

    print("")
    print("Done. Next:")
    print("  cd native-wrapper && ./gradlew assembleRelease")


if __name__ == "__main__":
    main()
