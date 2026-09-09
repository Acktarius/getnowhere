import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      "expo-crypto": path.join(
        root,
        "native-wrapper/node_modules/expo-crypto/build/Crypto.js",
      ),
      // Real RN is Flow; unit tests need a tiny Platform stub.
      "react-native": path.join(
        root,
        "tests/native-wrapper/stubs/react-native.ts",
      ),
      // Expo native modules pull expo-modules-core; stub for unit tests.
      // Directory alias so `expo-file-system/legacy` resolves to legacy.ts.
      "expo-file-system": path.join(
        root,
        "tests/native-wrapper/stubs/expo-file-system",
      ),
      "expo-sharing": path.join(
        root,
        "tests/native-wrapper/stubs/expo-sharing.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "native-wrapper/src/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    pool: "threads",
  },
});
