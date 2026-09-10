import type { CSSProperties } from "react";
import { CopyButton } from "@/components/CopyButton";
import { NonSelectableText } from "@/components/NonSelectableText";

type Props = {
  value: string;
  className?: string;
  style?: CSSProperties;
};

/** Non-selectable display plus explicit Copy of the raw value. */
export function SensitiveValue({ value, className, style }: Props) {
  return (
    <div className="stack stack--gap-2">
      <NonSelectableText className={className} style={style}>
        {value}
      </NonSelectableText>
      <CopyButton value={value} />
    </div>
  );
}
