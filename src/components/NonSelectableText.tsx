import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Display text that cannot be selected for casual copy. */
export function NonSelectableText({ children, className, style }: Props) {
  return (
    <span
      className={className}
      style={{ ...style, userSelect: "none", WebkitUserSelect: "none" }}
    >
      {children}
    </span>
  );
}
