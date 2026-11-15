import type { ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Accessible modal (Radix). Bottom sheet on mobile, centered card on desktop. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl border bg-popover p-5 text-popover-foreground shadow-pop',
            'md:inset-auto md:start-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-y-1/2 md:rounded-2xl rtl:md:translate-x-1/2 ltr:md:-translate-x-1/2',
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-lg font-bold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="إغلاق">
              <X className="size-5" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
