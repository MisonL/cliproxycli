import type { PropsWithChildren, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  extra?: ReactNode;
  variant?: 'default' | 'glass' | 'outline';
  className?: string;
}

export function Card({ title, extra, variant = 'default', className = '', children }: PropsWithChildren<CardProps>) {
  const cardClasses = [
    'card',
    variant !== 'default' ? `card-${variant}` : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {(title || extra) && (
        <div className="card-header">
          <div className="title">{title}</div>
          {extra}
        </div>
      )}
      <div className="card-body">
        {children}
      </div>
    </div>
  );
}
