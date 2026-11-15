import { Navigate } from 'react-router';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { homeFor, useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';

/**
 * Waiting room for organizations not yet verified (or suspended).
 * Listens in real time: the moment an admin verifies, the app moves on.
 */
export default function PendingPage() {
  const { status, user, organization, logout } = useAuth();
  useRealtime();

  if (status === 'loading') return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN' || organization?.status === 'ACTIVE') return <Navigate to={homeFor(user, organization)} replace />;

  const suspended = organization?.status === 'SUSPENDED';
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-8">
      <Logo size={32} />
      <div className="my-auto w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
        <span
          className={`mx-auto grid size-16 place-items-center rounded-full ${suspended ? 'bg-urgency-critical-soft text-urgency-critical' : 'bg-claim-pending-soft text-claim-pending'}`}
        >
          {suspended ? <ShieldAlert className="size-8" /> : <Clock className="size-8" />}
        </span>
        <h1 className="mt-5 text-2xl font-bold">{suspended ? 'الحساب موقوف' : 'حسابك قيد التحقق'}</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {suspended
            ? organization?.statusReason
              ? `السبب: ${organization.statusReason}`
              : 'تواصل مع فريق FoodCycle لمعرفة التفاصيل.'
            : `شكراً لتسجيل ${organization?.name}. يراجع فريقنا البيانات ونفعّل الحساب عادةً خلال يوم عمل. ستنتقل تلقائياً فور التفعيل.`}
        </p>
        <Button variant="outline" className="mt-7" onClick={logout}>
          <LogOut />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
