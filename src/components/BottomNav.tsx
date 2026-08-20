import {
  LogOut,
  type LucideIcon,
  MessageSquare,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EXIT_SESSION_TIP } from "@/lib/uxTips";
import { runWalletSessionExit } from "@/services/storage/walletSessionExit";
import { useSettingsStore } from "@/state/settingsStore";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
};

export function BottomNav({
  chatsUnread = false,
  contactsUnread = false,
}: {
  chatsUnread?: boolean;
  contactsUnread?: boolean;
}) {
  const navigate = useNavigate();
  const showTips = useSettingsStore((s) => s.showTips);
  const [exitOpen, setExitOpen] = useState(false);
  const items: Item[] = [
    { to: "/chats", label: "Chats", icon: MessageSquare, badge: chatsUnread },
    { to: "/contacts", label: "Contacts", icon: Users, badge: contactsUnread },
    { to: "/wallet", label: "Wallet", icon: Wallet },
    { to: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <>
      <nav className="bottom-nav" role="navigation" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `bottom-nav__item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={22} strokeWidth={1.9} />
              <span>{item.label}</span>
              {item.badge && <span className="bottom-nav__badge" />}
            </NavLink>
          );
        })}
        <button
          type="button"
          className="bottom-nav__item"
          onClick={() => setExitOpen(true)}
        >
          <LogOut size={22} strokeWidth={1.9} />
          <span>Exit</span>
        </button>
      </nav>
      <ConfirmModal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Confirm disconnect"
        body={showTips ? EXIT_SESSION_TIP : undefined}
        confirmLabel="Confirm"
        busyLabel="Disconnecting…"
        onConfirm={async () => {
          await runWalletSessionExit((path) => {
            navigate(path);
          });
        }}
      />
    </>
  );
}
