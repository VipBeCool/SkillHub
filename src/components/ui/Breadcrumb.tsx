import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex items-center text-[13px] min-w-0">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <Fragment key={idx}>
            {idx > 0 && (
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-[var(--color-muted)] opacity-40 shrink-0" />
            )}
            {isLast ? (
              <span className="font-semibold text-[var(--foreground)] truncate">
                {item.label}
              </span>
            ) : (
              <button
                onClick={item.onClick}
                className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors truncate shrink-0 cursor-pointer"
              >
                {item.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
