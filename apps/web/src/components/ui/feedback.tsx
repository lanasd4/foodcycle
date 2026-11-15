import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted-foreground', className)} aria-label="جارٍ التحميل" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} />;
}

/** Placeholder while a list loads */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-destructive/30 bg-urgency-critical-soft px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-destructive" />
      <p className="mt-3 text-sm font-medium">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/** Inline error under a form */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-urgency-critical-soft px-3.5 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{errorMessage(error)}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
