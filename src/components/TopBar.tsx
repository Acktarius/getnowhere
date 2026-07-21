import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  bordered?: boolean;
};

export function TopBar({
  title,
  subtitle,
  leading,
  trailing,
  bordered,
}: Props) {
  return (
    <header className={`topbar ${bordered ? "topbar--bordered" : ""}`}>
      {leading}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="topbar__title">{title}</div>
        {subtitle && <div className="topbar__sub">{subtitle}</div>}
      </div>
      {trailing}
    </header>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="topbar__icon-btn" aria-label="Back">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}
