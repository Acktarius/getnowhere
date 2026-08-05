/**
 * Expo shell: loads bundled Vite UI from android_asset. P2P host is Bare (future).
 * @see docs/builds/expo-eas-android-build.md
 */
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useState } from "react";

/** Bundled dist synced to android/app/src/main/assets/ui/ before run. */
const ANDROID_UI_URI = "file:///android_asset/ui/index.html";

export default function App() {
  const [loading, setLoading] = useState(true);

  if (Platform.OS !== "android") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c9a227" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#c9a227" size="large" />
        </View>
      ) : null}
      <WebView
        source={{ uri: ANDROID_UI_URI }}
        style={styles.webview}
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoading(false)}
        onError={(e) => {
          console.error("WebView error", e.nativeEvent);
          setLoading(false);
        }}
      />
      {/* Future: inject native StorageAdapter before React mounts in WebView */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0b0f",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0a0b0f",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0b0f",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0b0f",
    zIndex: 1,
  },
});
