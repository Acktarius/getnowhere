/**
 * Expo shell: bundled Vite UI + Bare Hyperswarm worklet behind gnhMobile bridge.
 * @see docs/builds/expo-eas-android-build.md
 */
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateStatus } from "react-native";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import { WebView } from "react-native-webview";
import { createBridgeToken } from "./src/bridgeToken";
import type { GnhMobileBridge } from "./src/GnhMobileBridge";
import {
  isGnhBackgroundSyncNativeAvailable,
  registerBackgroundSyncWebViewInjector,
  resolveNativeBackgroundSync,
} from "./src/gnhBackgroundSyncNative";
import {
  buildSecurityResolveScript,
  handleSecurityWebViewMessage,
} from "./src/handleSecurityWebViewMessage";
import {
  buildBridgeEventDispatchScript,
  buildMobileBridgeInjection,
} from "./src/injectMobileBridge";
import {
  buildSaveTextFileResolveScript,
  handleSaveTextFileWebViewMessage,
} from "./src/saveTextFileFromWebView";
import { buildLifecycleDispatchScript } from "./src/securityBridgeInjection";
import {
  ANDROID_UI_ASSET_PREFIX,
  isAllowedWebViewNavigationUrl,
  WEBVIEW_ORIGIN_WHITELIST,
} from "./src/webviewNavigation";

SplashScreen.preventAutoHideAsync().catch(() => {});

const ANDROID_UI_URI = `${ANDROID_UI_ASSET_PREFIX}index.html`;

/** Retry delays after resume — WebView sandbox may still be frozen on first inject. */
const FOREGROUND_INJECT_RETRY_MS = [0, 300, 900] as const;

type PendingForeground = {
  backgroundElapsedMs?: number;
};

function resolveBridgeToken(): string | null {
  try {
    return createBridgeToken();
  } catch (err) {
    console.error("[gnh-mobile] bridge token generation failed", err);
    return null;
  }
}

function parseLifecycleHostMessage(raw: string): { type?: string } | null {
  try {
    const msg = JSON.parse(raw) as { channel?: string; type?: string };
    if (msg.channel !== "gnh-lifecycle") return null;
    return msg;
  } catch {
    return null;
  }
}

function parseBackgroundSyncMessage(raw: string): {
  requestId: string;
  outcome: string;
} | null {
  try {
    const msg = JSON.parse(raw) as {
      channel?: string;
      direction?: string;
      requestId?: string;
      outcome?: string;
    };
    if (msg.channel !== "gnh-background-sync" || msg.direction !== "response") {
      return null;
    }
    if (!msg.requestId || !msg.outcome) return null;
    return { requestId: msg.requestId, outcome: msg.outcome };
  } catch {
    return null;
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const bridgeRef = useRef<GnhMobileBridge | null>(null);
  const bridgeStartingRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const backgroundAtMsRef = useRef<number | null>(null);
  const pendingForegroundRef = useRef<PendingForeground | null>(null);
  const flushTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bridgeToken = useMemo(() => resolveBridgeToken(), []);

  const injectedBeforeLoad = useMemo(
    () => (bridgeToken ? buildMobileBridgeInjection(bridgeToken) : ""),
    [bridgeToken],
  );

  const injectLifecycle = useCallback(
    (type: string, backgroundElapsedMs?: number) => {
      const webView = webViewRef.current;
      if (!webView) {
        console.warn("[gnh-lifecycle] inject skipped — no WebView", {
          type,
          backgroundElapsedMs,
        });
        return false;
      }
      console.warn("[gnh-lifecycle] inject", { type, backgroundElapsedMs });
      webView.injectJavaScript(
        buildLifecycleDispatchScript(type, backgroundElapsedMs),
      );
      return true;
    },
    [],
  );

  const clearForegroundFlushTimeouts = useCallback(() => {
    for (const id of flushTimeoutsRef.current) clearTimeout(id);
    flushTimeoutsRef.current = [];
  }, []);

  const flushPendingForeground = useCallback(() => {
    const pending = pendingForegroundRef.current;
    if (!pending) return;
    injectLifecycle("foreground", pending.backgroundElapsedMs);
  }, [injectLifecycle]);

  const schedulePendingForegroundFlush = useCallback(() => {
    clearForegroundFlushTimeouts();
    for (const delayMs of FOREGROUND_INJECT_RETRY_MS) {
      const id = setTimeout(() => flushPendingForeground(), delayMs);
      flushTimeoutsRef.current.push(id);
    }
  }, [clearForegroundFlushTimeouts, flushPendingForeground]);

  const noteBackground = useCallback(() => {
    if (backgroundAtMsRef.current == null) {
      backgroundAtMsRef.current = Date.now();
    }
    console.warn("[gnh-lifecycle] AppState background", {
      backgroundAtMs: backgroundAtMsRef.current,
    });
    injectLifecycle("background");
  }, [injectLifecycle]);

  const noteForeground = useCallback(() => {
    const elapsedMs =
      backgroundAtMsRef.current != null
        ? Date.now() - backgroundAtMsRef.current
        : undefined;
    backgroundAtMsRef.current = null;
    pendingForegroundRef.current = { backgroundElapsedMs: elapsedMs };
    console.warn("[gnh-lifecycle] AppState foreground", {
      backgroundElapsedMs: elapsedMs,
      hasWebView: !!webViewRef.current,
    });
    schedulePendingForegroundFlush();
  }, [schedulePendingForegroundFlush]);

  const onWebViewReady = useCallback(() => {
    setLoading(false);
    void SplashScreen.hideAsync();
    flushPendingForeground();

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
  }, [bridgeToken, flushPendingForeground]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      void SplashScreen.hideAsync();
    }
    return () => {
      clearForegroundFlushTimeouts();
      bridgeRef.current?.destroy();
      bridgeRef.current = null;
      bridgeStartingRef.current = false;
    };
  }, [clearForegroundFlushTimeouts]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isGnhBackgroundSyncNativeAvailable()) return;
    return registerBackgroundSyncWebViewInjector((script) => {
      webViewRef.current?.injectJavaScript(script);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const dispatch = (state: AppStateStatus) => {
      console.warn("[gnh-lifecycle] AppState change", state);
      if (state === "background" || state === "inactive") {
        noteBackground();
        return;
      }
      if (state === "active") {
        noteForeground();
      }
    };
    const sub = AppState.addEventListener("change", dispatch);
    return () => sub.remove();
  }, [noteBackground, noteForeground]);

  const onWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;
      const bgSync = parseBackgroundSyncMessage(raw);
      if (bgSync) {
        resolveNativeBackgroundSync(bgSync.requestId, bgSync.outcome);
        return;
      }
      const lifecycleMsg = parseLifecycleHostMessage(raw);
      if (lifecycleMsg?.type === "ui-ready") {
        console.warn("[gnh-lifecycle] WebView ui-ready");
        flushPendingForeground();
        return;
      }
      if (lifecycleMsg?.type === "lifecycle-delivered") {
        console.warn("[gnh-lifecycle] WebView delivered", lifecycleMsg);
        pendingForegroundRef.current = null;
        clearForegroundFlushTimeouts();
        return;
      }
      if (
        handleSaveTextFileWebViewMessage(raw, (result) => {
          webViewRef.current?.injectJavaScript(
            buildSaveTextFileResolveScript(result),
          );
        })
      ) {
        return;
      }
      if (
        handleSecurityWebViewMessage(raw, (response) => {
          webViewRef.current?.injectJavaScript(
            buildSecurityResolveScript(response),
          );
        })
      ) {
        return;
      }
      bridgeRef.current?.handleWebViewMessage(raw);
    },
    [clearForegroundFlushTimeouts, flushPendingForeground],
  );

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
