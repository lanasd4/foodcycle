import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, HandHeart, QrCode } from 'lucide-react';
import { ClaimStatusBadge } from '@/components/domain/domain';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/feedback';
import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useCountdown } from '@/lib/clock';
import { api } from '@/lib/api';
import { fmtCountdown, fmtKg, fmtRelative } from '@/lib/format';
import type { Claim, Page } from '@/lib/types';

export default function MyClaims() {
  const q = useQuery({ queryKey: ['claims', 'mine'], queryFn: () => api.get<Page<Claim>>('/claims/mine', { limit: 50 }) });
  const all = q.data?.items ?? [];
  const active = all.filter((c) => c.status === 'RESERVED' || c.status === 'PENDING_APPROVAL');
  const history = all.filter((c) => c.status !== 'RESERVED' && c.status !== 'PENDING_APPROVAL');

  return (
    <>
      <PageHeader title="حجوزاتي" subtitle="اعرضوا رمز QR عند الاستلام." />
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="active" className="flex-1">
              النشطة ({active.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              السابقة
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-5">
            {active.length === 0 ? (
              <EmptyState
                icon={HandHeart}
                title="لا حجوزات نشطة"
                action={
                  <Button asChild>
                    <Link to="/charity">تصفح العروض</Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((c) => (
                  <ClaimRow key={c.id} claim={c} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            {history.length === 0 ? (
              <EmptyState icon={HandHeart} title="لا عمليات سابقة بعد" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {history.map((c) => (
                  <ClaimRow key={c.id} claim={c} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const reserveLeft = useCountdown(claim.reservationSecondsLeft);
  const approvalLeft = useCountdown(claim.approvalSecondsLeft);
  return (
    <Link to={`/charity/claims/${claim.id}`} className="block rounded-xl">
      <Card className="transition-shadow hover:shadow-pop">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <QrCode className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{claim.offer?.title}</p>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground num">
              {claim.offer?.donorName} · {fmtKg(claim.quantityKg)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground num">
              {claim.status === 'RESERVED' && reserveLeft != null && `الاستلام خلال ${fmtCountdown(reserveLeft)}`}
              {claim.status === 'PENDING_APPROVAL' && approvalLeft != null && `ينتظر الرد · ${fmtCountdown(approvalLeft)}`}
              {claim.status !== 'RESERVED' && claim.status !== 'PENDING_APPROVAL' && fmtRelative(claim.pickedUpAt ?? claim.createdAt)}
            </p>
          </div>
          <ChevronLeft className="size-5 text-muted-foreground ltr:rotate-180" />
        </CardContent>
      </Card>
    </Link>
  );
}
