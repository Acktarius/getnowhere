/**
 * Keeps primary tab screens mounted after first visit (lazy keep-alive).
 * Avoids full React remount on bottom-nav switches — mobile WebView perf.
 */
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import {
  activeTabFromPath,
  isTabDetailPath,
  type MainTabId,
} from "@/layouts/mainTabPaths";
import { ChatsScreen } from "@/screens/chats/ChatsScreen";
import { ContactsScreen } from "@/screens/contacts/ContactsScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { WalletScreen } from "@/screens/wallet/WalletScreen";

function TabPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`tab-panel${active ? " tab-panel--active" : ""}`}
      aria-hidden={!active}
      hidden={!active}
    >
      {children}
    </div>
  );
}

export function MainTabShell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const activeTab = activeTabFromPath(pathname);
  const detailOpen = isTabDetailPath(pathname);
  const [visited, setVisited] = useState<Set<MainTabId>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const showTabPanel = (tab: MainTabId) =>
    visited.has(tab) && activeTab === tab && !detailOpen;

  return (
    <div className="main-tab-shell">
      <div
        className={`tab-panels${detailOpen ? " tab-panels--suspended" : ""}`}
      >
        {visited.has("chats") && (
          <TabPanel active={showTabPanel("chats")}>
            <ChatsScreen />
          </TabPanel>
        )}
        {visited.has("contacts") && (
          <TabPanel active={showTabPanel("contacts")}>
            <ContactsScreen />
          </TabPanel>
        )}
        {visited.has("wallet") && (
          <TabPanel active={showTabPanel("wallet")}>
            <WalletScreen />
          </TabPanel>
        )}
        {visited.has("settings") && (
          <TabPanel active={showTabPanel("settings")}>
            <SettingsScreen />
          </TabPanel>
        )}
      </div>
      {detailOpen && outlet ? <div className="tab-detail">{outlet}</div> : null}
    </div>
  );
}
