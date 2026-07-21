import {
  type LucideIcon,
  MessageSquare,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { NavLink } from "react-router-dom";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
};

export function BottomNav({ unread = false }: { unread?: boolean }) {
  const items: Item[] = [
    { to: "/contacts", label: "Contacts", icon: Users },
    { to: "/wallet", label: "Wallet", icon: Wallet },
    { to: "/chats", label: "Chats", icon: MessageSquare, badge: unread },
    { to: "/settings", label: "Settings", icon: Settings },
  ];
  return (
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
    </nav>
  );
}
