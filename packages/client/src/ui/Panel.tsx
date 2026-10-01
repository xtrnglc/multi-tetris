import type { ReactNode } from 'react';

interface PanelProps {
  label?: string;
  align?: 'left' | 'right';
  className?: string;
  /** Marks this panel as a perch for the cats. */
  anchor?: string;
  children: ReactNode;
}

export function Panel({ label, align = 'left', className = '', anchor, children }: PanelProps) {
  return (
    <section className={`panel ${className}`} data-cat-anchor={anchor}>
      <div className="panel-inner">
        {label && <h2 className={`panel-label ${align}`}>{label}</h2>}
        {children}
      </div>
    </section>
  );
}
