import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './tw';

export type PanelProps = {
  icon?: LucideIcon;
  title: string;
  /** 标题右侧的一句话说明 */
  annotation?: string;
  children: ReactNode;
  bodyClassName?: string;
};

/** 内容分区：带标题行的圆角卡片，所有视图的主体容器 */
export function Panel({ icon: Icon, title, annotation, children, bodyClassName }: PanelProps) {
  return (
    <section className="rounded-xl bg-surface shadow-card ring-1 ring-line">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
              <Icon aria-hidden="true" className="size-4" />
            </span>
          )}
          <h2 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h2>
          {annotation && <span className="hidden truncate text-xs text-fg-subtle md:inline">{annotation}</span>}
        </div>
      </header>
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}
