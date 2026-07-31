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
import { runWalletSessionExit } from "@/services/storage/walletSessionExit";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
};

export function BottomNav({ unread = false }: { unread?: boolean }) {
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  const items: Item[] = [
    { to: "/chats", label: "Chats", icon: MessageSquare, badge: unread },
    { to: "/contacts", label: "Contacts", icon: Users },
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
        body="Your wallet stays on this device. Keys leave memory until you reopen from welcome. If Local message retention is on, chat text is saved encrypted with the wallet."
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
