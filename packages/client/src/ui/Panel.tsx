import type { ReactNode } from 'react';

interface PanelProps {
  label?: string;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}

export function Panel({ label, align = 'left', className = '', children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-inner">
        {label && <h2 className={`panel-label ${align}`}>{label}</h2>}
        {children}
      </div>
    </section>
  );
}
