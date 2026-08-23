import type { ReactNode } from 'react';

export function Panel({
  title,
  right,
  tight,
  className,
  children,
}: {
  title?: string;
  right?: ReactNode;
  tight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`panel${tight ? ' panel--tight' : ''}${className ? ` ${className}` : ''}`}>
      {title && (
        <div className="panel-header">
          <h3 className="panel-title">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
