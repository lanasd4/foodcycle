import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/feedback';
import { Badge, Card, Input, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface AuditRow {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  'auth.register': 'تسجيل حساب',
  'auth.login.success': 'دخول',
  'auth.login.failed': 'دخول فاشل',
  'org.verified': 'تفعيل جهة',
  'org.suspended': 'إيقاف جهة',
  'org.reactivated': 'إعادة تفعيل',
  'org.settings.updated': 'تعديل إعدادات جهة',
  'org.needs.updated': 'تعديل احتياجات',
  'offer.created': 'نشر عرض',
  'offer.updated': 'تعديل عرض',
  'offer.cancelled': 'إلغاء عرض',
  'offer.expired': 'انتهاء عرض',
  'claim.created': 'طلب استلام',
  'claim.approved': 'موافقة',
  'claim.rejected': 'رفض',
  'claim.approval_timeout': 'انتهاء مهلة موافقة',
  'claim.cancelled': 'إلغاء حجز',
  'claim.expired': 'عدم حضور',
  'claim.picked_up': 'تأكيد استلام',
  'rating.created': 'تقييم',
  'trust_score.changed': 'تغيّر الالتزام',
  'settings.weights.updated': 'تعديل أوزان المطابقة',
  'settings.updated': 'تعديل الإعدادات',
};

const ROLE_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'closed' | 'reserved'> = {
  ADMIN: 'accent',
  DONOR: 'primary',
  CHARITY: 'reserved',
  SYSTEM: 'neutral',
  ANONYMOUS: 'closed',
};

/** Append-only audit log, newest first, with filters and "load more" (cursor). */
export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['audit', action, entityId],
    queryFn: ({ pageParam }) =>
      api.get<{ items: AuditRow[]; nextCursor: string | null }>('/admin/audit-logs', {
        action,
        entityId: entityId.trim(),
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="سجل التدقيق" subtitle="كل حدث مهم، لا يُعدَّل ولا يُحذف." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[16rem_1fr]">
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="نوع الحدث">
          <option value="">كل الأحداث</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input dir="ltr" placeholder="entity id (UUID)" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
      </div>
      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="لا أحداث" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">الوقت</th>
                <th className="px-4 py-2.5 text-start font-medium">الحدث</th>
                <th className="px-4 py-2.5 text-start font-medium">الفاعل</th>
                <th className="px-4 py-2.5 text-start font-medium">التغيير</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground num">{fmtDateTime(r.occurredAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {r.entityType}:{r.entityId?.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONE[r.actorRole] ?? 'neutral'}>{r.actorRole}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Change before={r.before} after={r.after} metadata={r.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {q.hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'جارٍ التحميل…' : 'المزيد'}
          </Button>
        </div>
      )}
    </>
  );
}

function Change({
  before,
  after,
  metadata,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}) {
  const keys = Object.keys(after ?? {}).slice(0, 4);
  const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <div className="space-y-0.5 text-xs" dir="ltr">
      {keys.map((k) => (
        <p key={k} className="truncate">
          <span className="text-muted-foreground">{k}: </span>
          {before && k in before && <span className="text-destructive line-through">{show(before[k])}</span>}
          {before && k in before && ' → '}
          <span className="text-success">{show(after![k])}</span>
        </p>
      ))}
      {keys.length === 0 && metadata && <p className="truncate text-muted-foreground">{show(metadata)}</p>}
    </div>
  );
}
