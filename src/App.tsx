import { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AppAccessBlurOverlay } from "@/components/AppAccessBlurOverlay";
import { ToastHost } from "@/components/ToastHost";
import { useAppAccessLocked } from "@/hooks/useAppAccessLocked";
import { useApplyTheme } from "@/hooks/useApplyTheme";
import { useMobileAppAccess } from "@/hooks/useMobileAppAccess";
import { useSeedDemoContacts } from "@/hooks/useSeedDemoContacts";
import { useWalletLiveSync } from "@/hooks/useWalletLiveSync";
import { MainTabShell } from "@/layouts/MainTabShell";
import { reconcileBiometricSettingsWithEnrollments } from "@/lib/auth/biometric-lifecycle";
import { scrubLeftoverDaemonCaches } from "@/lib/config";
import { installBackgroundRemoteSyncHook } from "@/lib/mobile/backgroundRemoteSync";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { AppLockScreen } from "@/screens/AppLockScreen";
import { ChatRoomScreen } from "@/screens/chats/ChatRoomScreen";
import { ContactDetailScreen } from "@/screens/contacts/ContactDetailScreen";
import { CreateWalletScreen } from "@/screens/onboarding/CreateWalletScreen";
import { ImportWalletScreen } from "@/screens/onboarding/ImportWalletScreen";
import { RestoreWalletScreen } from "@/screens/onboarding/RestoreWalletScreen";
import { WelcomeScreen } from "@/screens/onboarding/WelcomeScreen";
import { AboutScreen } from "@/screens/settings/AboutScreen";
import { BackupSettingsScreen } from "@/screens/settings/BackupSettingsScreen";
import { SecuritySettingsScreen } from "@/screens/settings/SecuritySettingsScreen";
import { WalletPasswordScreen } from "@/screens/settings/WalletPasswordScreen";
import { isOnboarded, useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

function AppInner() {
  useApplyTheme();
  useMobileAppAccess();
  const location = useLocation();
  const init = useAuthStore((s) => s.init);
  const appAccessLocked = useAppAccessLocked();
  const appAccessBiometricEnabled = useSettingsStore(
    (s) => s.appAccessBiometricEnabled,
  );
  const walletInitialized = useWalletStore((s) => s.initialized);
  const hydrateContacts = useContactsStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    scrubLeftoverDaemonCaches();
    if (isMobileHost()) installBackgroundRemoteSyncHook();
    init().then(async () => {
      await hydrateContacts();
      if (isMobileHost()) {
        await reconcileBiometricSettingsWithEnrollments();
      }
      setReady(true);
    });
  }, [init, hydrateContacts]);

  const onboarded = isOnboarded();
  const onOnboardingPath =
    location.pathname.startsWith("/welcome") ||
    location.pathname.startsWith("/onboarding");

  if (!ready) return null;

  // Onboarding gate
  if (!onboarded && !walletInitialized && !onOnboardingPath) {
    return <Navigate to="/welcome" replace />;
  }

  // App-access lock (mobile + app biometrics enabled)
  if (
    onboarded &&
    isMobileHost() &&
    appAccessBiometricEnabled &&
    appAccessLocked
  ) {
    return <AppLockScreen />;
  }

  return (
    <Routes>
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/onboarding/create" element={<CreateWalletScreen />} />
      <Route path="/onboarding/restore" element={<RestoreWalletScreen />} />
      <Route path="/onboarding/import" element={<ImportWalletScreen />} />

      <Route element={<RequireWallet />}>
        <Route element={<MainTabShell />}>
          <Route path="/chats" />
          <Route path="/contacts" />
          <Route path="/wallet" />
          <Route path="/settings" />
          <Route path="/contacts/:id" element={<ContactDetailScreen />} />
          <Route path="/chats/:roomId" element={<ChatRoomScreen />} />
          <Route
            path="/settings/security"
            element={<SecuritySettingsScreen />}
          />
          <Route
            path="/settings/wallet-password"
            element={<WalletPasswordScreen />}
          />
          <Route path="/settings/backup" element={<BackupSettingsScreen />} />
          <Route path="/settings/about" element={<AboutScreen />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

function RequireWallet() {
  const initialized = useWalletStore((s) => s.initialized);
  useSeedDemoContacts();
  useWalletLiveSync(initialized);
  if (!initialized) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <div className="app-shell">
      {/* HashRouter keeps routing static-hosting + WebView-safe: no server
          rewrite rules needed, and deep links work from file:// or a bundled
          local path inside an Expo WebView shell. */}
      <HashRouter>
        <AppInner />
      </HashRouter>
      <AppAccessBlurOverlay />
      <ToastHost />
    </div>
  );
}
