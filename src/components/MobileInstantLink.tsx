import { useRef } from "react";
import { Link, type LinkProps, useNavigate } from "react-router-dom";
import { bindInstantNav } from "@/lib/instant-nav";

/** Router link that navigates on first mobile WebView tap (no hover-tap loss). */
export function MobileInstantLink({
  to,
  onClick,
  onPointerDown,
  ...rest
}: LinkProps) {
  const navigate = useNavigate();
  const guard = useRef(false);
  const instant = bindInstantNav(guard, () => navigate(to));

  return (
    <Link
      to={to}
      {...rest}
      onPointerDown={(e) => {
        instant.onPointerDown(e);
        onPointerDown?.(e);
      }}
      onClick={(e) => {
        instant.onClick(e);
        onClick?.(e);
      }}
    />
  );
}
