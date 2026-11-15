import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { HandHeart, PackageOpen, Plus, Scale, ScanLine, Users } from 'lucide-react';
import { IncomingClaim } from '@/components/app/IncomingClaim';
import { OfferCard, StatTile } from '@/components/domain/domain';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/feedback';
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNumber } from '@/lib/format';
import { OFFER_STATUS_LABEL, toCardData } from '@/lib/offer-card';
import type { Claim, Offer, Page } from '@/lib/types';

export default function DonorHome() {
  const { organization } = useAuth();
  const offers = useQuery({
    queryKey: ['my-offers'],
    queryFn: () => api.get<Page<Offer>>('/offers/mine', { limit: 50 }),
    refetchInterval: 60_000, // keeps countdowns and urgency fresh
  });
  const pending = useQuery({
    queryKey: ['incoming', 'PENDING_APPROVAL'],
    queryFn: () => api.get<Page<Claim>>('/claims/incoming', { status: 'PENDING_APPROVAL', limit: 50 }),
  });
  const impact = useQuery({
    queryKey: ['impact', 'me'],
    queryFn: () => api.get<{ kg: number; pickups: number; partners: number }>('/analytics/me'),
  });

  const all = offers.data?.items ?? [];
  const active = all.filter((o) => o.status === 'PUBLISHED' || o.status === 'RESERVED');
  const closed = all.filter((o) => o.status !== 'PUBLISHED' && o.status !== 'RESERVED');
  const pendingCount = pending.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title={`أهلاً، ${organization?.name}`}
        subtitle="تابع عروضك وطلبات الاستلام."
        action={
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/donor/offers/new">
              <Plus />
              نشر عرض
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="أنقذتم (30 يوماً)" value={fmtNumber(impact.data?.kg ?? 0)} unit="كغ" icon={Scale} />
        <StatTile label="عمليات استلام" value={String(impact.data?.pickups ?? 0)} icon={HandHeart} />
        <StatTile label="جمعيات خدمتموها" value={String(impact.data?.partners ?? 0)} icon={Users} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:hidden">
        <Button asChild size="lg">
          <Link to="/donor/offers/new">
            <Plus />
            نشر عرض
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/donor/scan">
            <ScanLine />
            تأكيد استلام
          </Link>
        </Button>
      </div>

      <Tabs defaultValue={pendingCount > 0 ? 'pending' : 'active'}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="active" className="flex-1">
            نشطة <Badge tone="neutral" className="num">{active.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1">
            بانتظار موافقتك {pendingCount > 0 && <Badge tone="pending" className="num">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">
            السابقة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-5">
          {offers.isPending ? (
            <ListSkeleton />
          ) : offers.isError ? (
            <ErrorState error={offers.error} onRetry={() => offers.refetch()} />
          ) : active.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="لا توجد عروض نشطة"
              text="عندك طعام فائض اليوم؟ انشره في دقيقة وتصل الجمعيات القريبة فوراً."
              action={
                <Button asChild>
                  <Link to="/donor/offers/new">
                    <Plus />
                    نشر عرض
                  </Link>
                </Button>
              }
            />
          ) : (
            <OfferGrid offers={active} />
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-5">
          {pending.isPending ? (
            <ListSkeleton rows={2} />
          ) : pendingCount === 0 ? (
            <EmptyState icon={HandHeart} title="لا طلبات بانتظار موافقتك" text="عند وصول طلب سيظهر هنا ويصلك إشعار فوري." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pending.data!.items.map((c) => (
                <IncomingClaim key={c.id} claim={c} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closed" className="mt-5">
          {closed.length === 0 ? (
            <EmptyState icon={PackageOpen} title="لا توجد عروض سابقة بعد" />
          ) : (
            <OfferGrid offers={closed} />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function OfferGrid({ offers }: { offers: Offer[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {offers.map((o) => {
        const live = o.status === 'PUBLISHED' || o.status === 'RESERVED';
        return (
          <Link key={o.id} to={`/donor/offers/${o.id}`} className="block rounded-xl">
            <OfferCard
              offer={{ ...toCardData(o), distanceKm: undefined }}
              muted={!live}
              badge={o.status !== 'PUBLISHED' ? <Badge tone={live ? 'reserved' : 'closed'}>{OFFER_STATUS_LABEL[o.status]}</Badge> : undefined}
            />
          </Link>
        );
      })}
    </div>
  );
}
