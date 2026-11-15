import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  ClipboardList,
  Gauge,
  HandHeart,
  Home,
  LogOut,
  Moon,
  PlusCircle,
  ScanLine,
  ScrollText,
  Settings,
  Sparkles,
  Sun,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtRelative, ORG_TYPE_LABEL } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { useTheme } from '@/lib/theme';
import type { Notification } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Record<'DONOR' | 'CHARITY' | 'ADMIN', NavItem[]> = {
  DONOR: [
    { to: '/donor', label: 'عروضي', icon: Home, end: true },
    { to: '/donor/offers/new', label: 'نشر عرض', icon: PlusCircle },
    { to: '/donor/scan', label: 'تأكيد استلام', icon: ScanLine },
    { to: '/account', label: 'حسابي', icon: UserIcon },
  ],
  CHARITY: [
    { to: '/charity', label: 'العروض', icon: Sparkles, end: true },
    { to: '/charity/claims', label: 'حجوزاتي', icon: HandHeart },
    { to: '/charity/needs', label: 'احتياجاتنا', icon: ClipboardList },
    { to: '/account', label: 'حسابي', icon: UserIcon },
  ],
  ADMIN: [
    { to: '/admin', label: 'لوحة الأثر', icon: Gauge, end: true },
    { to: '/admin/orgs', label: 'الجهات', icon: Building2 },
    { to: '/admin/audit', label: 'سجل التدقيق', icon: ScrollText },
    { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
  ],
};

/**
 * Main layout. Mobile: top bar + bottom tab bar (thumb reach).
 * Desktop: one top bar with the navigation inline.
 */
export function AppShell() {
  const { user, organization } = useAuth();
  const connected = useRealtime();
  const items = NAV[user!.role];
  const wide = user!.role === 'ADMIN';

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className={cn('mx-auto flex h-15 items-center gap-4 px-4', wide ? 'max-w-7xl' : 'max-w-5xl')}>
          <NavLink to="/" aria-label="FoodCycle">
            <Logo size={30} />
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary-soft text-primary-soft-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <i.icon className="size-4" />
                {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            {organization && (
              <span className="hidden max-w-48 truncate text-sm text-muted-foreground lg:block">
                {organization.name} · {ORG_TYPE_LABEL[organization.type]}
              </span>
            )}
            <span
              className={cn('mx-1 size-2 rounded-full', connected ? 'bg-success' : 'bg-input')}
              title={connected ? 'متصل لحظياً' : 'غير متصل'}
              aria-label={connected ? 'متصل لحظياً' : 'غير متصل'}
            />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-6', wide ? 'max-w-7xl' : 'max-w-5xl')}>
        <Outlet />
      </main>

      {/* bottom tab bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <i.icon className="size-5" />
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const navigate = useNavigate();
  const qc = useQueryClient();

  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
  });
  const list = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: () => api.get<{ items: Notification[] }>('/notifications', { limit: 8 }),
    enabled: open,
  });

  const count = unread.data?.unread ?? 0;

  async function openOne(n: Notification) {
    if (!n.readAt) await api.patch(`/notifications/${n.id}/read`);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    const link = linkFor(n);
    if (link) navigate(link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted"
        aria-label={`الإشعارات${count ? ` (${count} غير مقروء)` : ''}`}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute end-1 top-1 grid min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground num">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-pop">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">الإشعارات</span>
            {count > 0 && (
              <button
                className="cursor-pointer text-xs font-medium text-primary hover:underline"
                onClick={async () => {
                  await api.post('/notifications/read-all');
                  void qc.invalidateQueries({ queryKey: ['notifications'] });
                }}
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.data?.items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد إشعارات بعد</p>
            )}
            {list.data?.items.map((n) => (
              <button
                key={n.id}
                onClick={() => openOne(n)}
                className={cn(
                  'flex w-full cursor-pointer gap-3 border-b px-4 py-3 text-start last:border-0 hover:bg-muted',
                  !n.readAt && 'bg-primary-soft/40',
                )}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{fmtRelative(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Where tapping a notification leads */
function linkFor(n: Notification): string | null {
  const d = n.data as Record<string, string>;
  if (n.type === 'offer.new_match') return `/charity/offers/${d.offerId}`;
  if (n.type === 'org.pending_verification') return '/admin/orgs';
  if (n.type.startsWith('org.')) return '/';
  if (['claim.pending_approval', 'claim.reserved', 'claim.approval_timeout.donor', 'claim.expired.donor', 'claim.cancelled_by_charity', 'offer.expired'].includes(n.type))
    return `/donor/offers/${d.offerId}`;
  if (n.type.startsWith('claim.')) return `/charity/claims/${d.claimId}`;
  if (n.type === 'rating.received') return '/account';
  return null;
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted"
        aria-label="القائمة"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {user!.email[0].toUpperCase()}
        </span>
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-40 w-60 overflow-hidden rounded-xl border bg-popover p-1.5 shadow-pop">
          <p className="truncate px-3 py-2 text-xs text-muted-foreground" dir="ltr">
            {user!.email}
          </p>
          <button onClick={toggle} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-muted">
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
          </button>
          <button
            onClick={logout}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-destructive hover:bg-muted"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}
