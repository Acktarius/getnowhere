import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, body, action }: Props) {
  return (
    <div className="empty fade-in-up">
      {Icon && (
        <div className="empty__icon">
          <Icon size={24} strokeWidth={1.7} />
        </div>
      )}
      <div className="empty__title">{title}</div>
      {body && <div className="empty__body">{body}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
