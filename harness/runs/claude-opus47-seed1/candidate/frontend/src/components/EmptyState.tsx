import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
