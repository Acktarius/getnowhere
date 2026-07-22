import { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useApplyTheme } from "@/hooks/useApplyTheme";
import { useSeedDemoContacts } from "@/hooks/useSeedDemoContacts";
import { scrubLeftoverDaemonCaches } from "@/lib/config";
import { ChatRoomScreen } from "@/screens/chats/ChatRoomScreen";
import { ChatsScreen } from "@/screens/chats/ChatsScreen";
import { ContactDetailScreen } from "@/screens/contacts/ContactDetailScreen";
import { ContactsScreen } from "@/screens/contacts/ContactsScreen";
import { CreateWalletScreen } from "@/screens/onboarding/CreateWalletScreen";
import { ImportWalletScreen } from "@/screens/onboarding/ImportWalletScreen";
import { RestoreWalletScreen } from "@/screens/onboarding/RestoreWalletScreen";
import { WelcomeScreen } from "@/screens/onboarding/WelcomeScreen";
import { AboutScreen } from "@/screens/settings/AboutScreen";
import { BackupSettingsScreen } from "@/screens/settings/BackupSettingsScreen";
import { SecuritySettingsScreen } from "@/screens/settings/SecuritySettingsScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { WalletPasswordScreen } from "@/screens/settings/WalletPasswordScreen";
import { UnlockScreen } from "@/screens/UnlockScreen";
import { WalletScreen } from "@/screens/wallet/WalletScreen";
import { isOnboarded, useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";

function AppInner() {
  useApplyTheme();
  const location = useLocation();
  const init = useAuthStore((s) => s.init);
  const passcodeSet = useAuthStore((s) => s.passcodeSet);
  const unlocked = useAuthStore((s) => s.unlocked);
  const walletInitialized = useWalletStore((s) => s.initialized);
  const hydrateContacts = useContactsStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    scrubLeftoverDaemonCaches();
    init().then(async () => {
      await hydrateContacts();
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

  // Unlock gate (after onboarding complete, app locked)
  if (onboarded && passcodeSet && !unlocked && !onOnboardingPath) {
    return <UnlockScreen />;
  }

  return (
    <Routes>
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/onboarding/create" element={<CreateWalletScreen />} />
      <Route path="/onboarding/restore" element={<RestoreWalletScreen />} />
      <Route path="/onboarding/import" element={<ImportWalletScreen />} />

      <Route element={<RequireWallet />}>
        <Route path="/contacts" element={<ContactsScreen />} />
        <Route path="/contacts/:id" element={<ContactDetailScreen />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/chats" element={<ChatsScreen />} />
        <Route path="/chats/:roomId" element={<ChatRoomScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/security" element={<SecuritySettingsScreen />} />
        <Route
          path="/settings/wallet-password"
          element={<WalletPasswordScreen />}
        />
        <Route path="/settings/backup" element={<BackupSettingsScreen />} />
        <Route path="/settings/about" element={<AboutScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

function RequireWallet() {
  const initialized = useWalletStore((s) => s.initialized);
  useSeedDemoContacts();
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
    </div>
  );
}
