import type { ReactNode } from 'react';
import { Leaf } from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand/Logo';

/** Split layout: brand panel (desktop only) + form. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo size={34} />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -bottom-40 -start-40 size-[32rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <LogoMark size={64} tone="plain" className="text-primary-foreground" />
        <div className="relative text-primary-foreground">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
            <Leaf className="size-4" />
            منصة لإنقاذ الطعام
          </p>
          <h2 className="mt-5 text-4xl font-bold leading-tight">
            كل وجبة تستحق
            <br />
            فرصة ثانية
          </h2>
          <p className="mt-4 max-w-md leading-relaxed opacity-85">
            المطاعم والمخابز تنشر الفائض في دقيقة، والجمعيات القريبة تستلمه قبل أن يُهدر.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/70">FoodCycle</p>
      </aside>
    </div>
  );
}
