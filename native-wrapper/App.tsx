/**
 * Expo shell: bundled Vite UI + Bare Hyperswarm worklet behind gnhMobile bridge.
 * @see docs/builds/expo-eas-android-build.md
 */
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import { WebView } from "react-native-webview";
import { createBridgeToken } from "./src/bridgeToken";
import type { GnhMobileBridge } from "./src/GnhMobileBridge";
import {
  buildBridgeEventDispatchScript,
  buildMobileBridgeInjection,
} from "./src/injectMobileBridge";
import {
  buildSaveTextFileResolveScript,
  handleSaveTextFileWebViewMessage,
} from "./src/saveTextFileFromWebView";
import {
  ANDROID_UI_ASSET_PREFIX,
  isAllowedWebViewNavigationUrl,
  WEBVIEW_ORIGIN_WHITELIST,
} from "./src/webviewNavigation";

SplashScreen.preventAutoHideAsync().catch(() => {});

const ANDROID_UI_URI = `${ANDROID_UI_ASSET_PREFIX}index.html`;

function resolveBridgeToken(): string | null {
  try {
    return createBridgeToken();
  } catch (err) {
    console.error("[gnh-mobile] bridge token generation failed", err);
    return null;
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const bridgeRef = useRef<GnhMobileBridge | null>(null);
  const bridgeStartingRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const bridgeToken = useMemo(() => resolveBridgeToken(), []);

  const injectedBeforeLoad = useMemo(
    () => (bridgeToken ? buildMobileBridgeInjection(bridgeToken) : ""),
    [bridgeToken],
  );

  const onWebViewReady = useCallback(() => {
    setLoading(false);
    void SplashScreen.hideAsync();

    if (
      Platform.OS !== "android" ||
      !bridgeToken ||
      bridgeRef.current ||
      bridgeStartingRef.current
    ) {
      return;
    }
    bridgeStartingRef.current = true;

    void (async () => {
      try {
        const { GnhMobileBridge } = await import("./src/GnhMobileBridge");
        const bridge = new GnhMobileBridge(bridgeToken);
        bridgeRef.current = bridge;
        await bridge.ensureStarted();
        bridge.onEvent((evt) => {
          webViewRef.current?.injectJavaScript(
            buildBridgeEventDispatchScript(evt),
          );
        });
      } catch (err) {
        bridgeStartingRef.current = false;
        console.error("[gnh-mobile] Bare worklet start failed", err);
      }
    })();
  }, [bridgeToken]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      void SplashScreen.hideAsync();
    }
    return () => {
      bridgeRef.current?.destroy();
      bridgeRef.current = null;
      bridgeStartingRef.current = false;
    };
  }, []);

  const onWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (
      handleSaveTextFileWebViewMessage(raw, (result) => {
        webViewRef.current?.injectJavaScript(
          buildSaveTextFileResolveScript(result),
        );
      })
    ) {
      return;
    }
    bridgeRef.current?.handleWebViewMessage(raw);
  }, []);

  if (Platform.OS !== "android") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c9a227" />
      </View>
    );
  }

  if (!bridgeToken) {
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
        ref={webViewRef}
        source={{ uri: ANDROID_UI_URI }}
        style={styles.webview}
        originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
        allowFileAccess
        allowFileAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
        onShouldStartLoadWithRequest={(event) =>
          isAllowedWebViewNavigationUrl(event.url)
        }
        onLoadEnd={onWebViewReady}
        onMessage={onWebViewMessage}
        onError={(e) => {
          console.error("WebView error", e.nativeEvent);
          onWebViewReady();
        }}
      />
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
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0b0f",
    zIndex: 1,
  },
});
