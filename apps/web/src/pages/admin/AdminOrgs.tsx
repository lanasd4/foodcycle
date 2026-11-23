import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building2, Check, MapPin, Phone, RotateCcw, Star } from 'lucide-react';
import type { OrgStatus } from '@foodcycle/shared';
import { PointsMap } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, FormError, ListSkeleton, PageHeader } from '@/components/ui/feedback';
import { Badge, Card, CardContent, Field, Tabs, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cityLabel, fmtRelative, ORG_TYPE_LABEL } from '@/lib/format';
import type { Organization, Page } from '@/lib/types';

const STATUS_TONE = { PENDING_VERIFICATION: 'pending', ACTIVE: 'picked', SUSPENDED: 'rejected' } as const;
const STATUS_LABEL = { PENDING_VERIFICATION: 'قيد التحقق', ACTIVE: 'مفعّلة', SUSPENDED: 'موقوفة' };

/** Verification queue: admins verify new organizations before they can use the platform. */
export default function AdminOrgs() {
  const [status, setStatus] = useState<OrgStatus>('PENDING_VERIFICATION');
  const q = useQuery({
    queryKey: ['orgs', status],
    queryFn: () => api.get<Page<Organization>>('/organizations', { status, limit: 100 }),
  });

  return (
    <>
      <PageHeader title="الجهات" subtitle="تحقق من الجهات الجديدة قبل تفعيلها." />
      <Tabs value={status} onValueChange={(v) => setStatus(v as OrgStatus)}>
        <TabsList>
          <TabsTrigger value="PENDING_VERIFICATION">قيد التحقق</TabsTrigger>
          <TabsTrigger value="ACTIVE">مفعّلة</TabsTrigger>
          <TabsTrigger value="SUSPENDED">موقوفة</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-5">
        {q.isPending ? (
          <ListSkeleton rows={2} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Building2} title={status === 'PENDING_VERIFICATION' ? 'لا جهات بانتظار التحقق' : 'لا توجد جهات هنا'} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {q.data.items.map((o) => (
              <OrgCard key={o.id} org={o} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OrgCard({ org }: { org: Organization }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (body: { status: 'ACTIVE' | 'SUSPENDED'; reason?: string }) =>
      api.patch<Organization>(`/organizations/${org.id}/verify`, body),
    onSuccess: (o) => {
      toast({ tone: 'success', title: o.status === 'ACTIVE' ? `تم تفعيل ${o.name}` : `تم إيقاف ${o.name}`, body: 'أُبلغت الجهة فوراً.' });
      setSuspendOpen(false);
      void qc.invalidateQueries({ queryKey: ['orgs'] });
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">{org.name}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ORG_TYPE_LABEL[org.type]} · سجّلت {fmtRelative(org.createdAt)}
            </p>
          </div>
          <Badge tone={STATUS_TONE[org.status]}>{STATUS_LABEL[org.status]}</Badge>
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <MapPin className="size-4" />
            {cityLabel(org.city)} · {org.area} · {org.address}
          </p>
          <p className="flex items-center gap-2" dir="ltr">
            <Phone className="size-4" />
            {org.phone}
          </p>
          <p className="flex items-center gap-2">
            <Star className="size-4" />
            التزام <span className="num">{org.trustScore.toFixed(2)}</span>
            {org.registrationNumber && <> · ترخيص <span className="num">{org.registrationNumber}</span></>}
          </p>
          {org.statusReason && <p className="text-destructive">السبب: {org.statusReason}</p>}
        </div>
        <PointsMap className="mt-4 h-40" points={[{ position: org.location, label: org.address }]} />
        <div className="mt-4 flex gap-2">
          {org.status !== 'ACTIVE' && (
            <Button size="sm" className="flex-1" disabled={act.isPending} onClick={() => act.mutate({ status: 'ACTIVE' })}>
              {org.status === 'SUSPENDED' ? <RotateCcw /> : <Check />}
              {org.status === 'SUSPENDED' ? 'إعادة التفعيل' : 'تفعيل'}
            </Button>
          )}
          {org.status !== 'SUSPENDED' && (
            <Button size="sm" variant="outline" className="flex-1 text-destructive" onClick={() => setSuspendOpen(true)}>
              <Ban />
              {org.status === 'PENDING_VERIFICATION' ? 'رفض' : 'إيقاف'}
            </Button>
          )}
        </div>
        {act.error && !suspendOpen && (
          <div className="mt-3">
            <FormError error={act.error} />
          </div>
        )}
      </CardContent>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen} title={`إيقاف ${org.name}`} description="يصل السبب للجهة، ويطبّق الإيقاف فوراً.">
        <Field label="السبب" htmlFor={`r-${org.id}`}>
          <Textarea id={`r-${org.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="mt-3">
          <FormError error={act.error} />
        </div>
        <Button
          variant="destructive"
          block
          className="mt-4"
          disabled={reason.trim().length < 3 || act.isPending}
          onClick={() => act.mutate({ status: 'SUSPENDED', reason: reason.trim() })}
        >
          تأكيد الإيقاف
        </Button>
      </Dialog>
    </Card>
  );
}
