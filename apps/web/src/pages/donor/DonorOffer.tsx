import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Clock, MapPin, Sparkles, Star, Users } from 'lucide-react';
import { IncomingClaim } from '@/components/app/IncomingClaim';
import { RatingDialog } from '@/components/app/RatingDialog';
import { AllergenChips, ClaimStatusBadge, MatchSuggestionCard, StorageBadge, UrgencyBadge } from '@/components/domain/domain';
import { PointsMap } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, FormError, Spinner } from '@/components/ui/feedback';
import { Badge, Card, CardContent, Field, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fmtDateTime, fmtKg, fmtRelative } from '@/lib/format';
import { OFFER_STATUS_LABEL } from '@/lib/offer-card';
import type { CharityMatch, Claim, Offer, Page } from '@/lib/types';

export default function DonorOffer() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState<Claim | null>(null);

  const offer = useQuery({ queryKey: ['offer', id], queryFn: () => api.get<Offer>(`/offers/${id}`), refetchInterval: 60_000 });
  const claims = useQuery({
    queryKey: ['incoming', 'offer', id],
    queryFn: () => api.get<Page<Claim>>('/claims/incoming', { offerId: id, limit: 50 }),
  });
  const live = offer.data?.status === 'PUBLISHED' || offer.data?.status === 'RESERVED';
  const matches = useQuery({
    queryKey: ['matches', id],
    queryFn: () => api.get<{ items: CharityMatch[] }>(`/offers/${id}/matches`),
    enabled: offer.data?.status === 'PUBLISHED',
  });

  const cancel = useMutation({
    mutationFn: () => api.patch<Offer>(`/offers/${id}/cancel`, reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: () => {
      toast({ tone: 'info', title: 'تم إلغاء العرض', body: 'أُبلغت الجمعيات التي حجزت منه.' });
      setCancelOpen(false);
      for (const k of ['offer', 'my-offers', 'incoming']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  if (offer.isPending) return <Spinner />;
  if (offer.isError) return <ErrorState error={offer.error} onRetry={() => offer.refetch()} />;
  const o = offer.data;
  const pct = Math.round((o.remainingKg / o.quantityKg) * 100);
  const list = claims.data?.items ?? [];
  const pending = list.filter((c) => c.status === 'PENDING_APPROVAL');
  const others = list.filter((c) => c.status !== 'PENDING_APPROVAL');

  return (
    <>
      <Link to="/donor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4 ltr:rotate-180" />
        عروضي
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                {o.status === 'PUBLISHED' ? (
                  <UrgencyBadge remainingMinutes={o.remainingMinutes} />
                ) : (
                  <Badge tone={live ? 'reserved' : 'closed'}>{OFFER_STATUS_LABEL[o.status]}</Badge>
                )}
                <Badge tone="outline">{o.category?.name}</Badge>
                <StorageBadge condition={o.storageCondition} />
              </div>
              <h1 className="mt-3 text-2xl font-bold">{o.title}</h1>
              {o.ingredients && <p className="mt-1.5 text-sm text-muted-foreground">المكونات: {o.ingredients}</p>}
              {o.storageInstructions && <p className="mt-1 text-sm text-muted-foreground">{o.storageInstructions}</p>}

              <div className="mt-5">
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">المتاح</span>
                  <span className="font-semibold num">
                    {fmtKg(o.remainingKg)} <span className="font-normal text-muted-foreground">/ {fmtKg(o.quantityKg)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <Info icon={Clock} label="الحد الآمن للاستلام" value={fmtDateTime(o.effectiveDeadline)} />
                <Info icon={Clock} label="نُشر" value={fmtRelative(o.createdAt)} />
                <Info icon={MapPin} label="موقع الاستلام" value={`${o.area} · ${o.pickupAddress}`} />
                <Info
                  icon={Users}
                  label="الموافقة على الطلبات"
                  value={o.claimApprovalMode === 'MANUAL' ? 'يدوية' : o.claimApprovalMode === 'AUTO' ? 'تلقائية' : 'حسب إعداد المطعم'}
                />
              </dl>
              <div className="mt-4">
                <AllergenChips allergens={o.allergens} />
              </div>
              {o.cancelReason && <p className="mt-4 text-sm text-muted-foreground">سبب الإلغاء: {o.cancelReason}</p>}
            </CardContent>
          </Card>

          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">بانتظار موافقتك</h2>
              <div className="space-y-3">
                {pending.map((c) => (
                  <IncomingClaim key={c.id} claim={c} showOffer={false} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-semibold">الحجوزات</h2>
            {others.length === 0 ? (
              <EmptyState icon={Users} title="لا حجوزات بعد" text="ستظهر هنا فور حجز أي جمعية." />
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {others.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.charity?.name}</p>
                        <p className="text-xs text-muted-foreground num">
                          {fmtKg(c.quantityKg)} · {fmtRelative(c.pickedUpAt ?? c.createdAt)}
                        </p>
                      </div>
                      <ClaimStatusBadge status={c.status} />
                      {c.status === 'PICKED_UP' && (
                        <Button size="sm" variant="soft" onClick={() => setRating(c)}>
                          <Star />
                          قيّم
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <PointsMap points={[{ position: o.location, label: o.pickupAddress }]} />
          {o.status === 'PUBLISHED' && (
            <section>
              <h2 className="mb-3 flex items-center gap-1.5 font-semibold">
                <Sparkles className="size-4 text-accent" />
                الجمعيات الأنسب لهذا العرض
              </h2>
              {matches.isPending ? (
                <Spinner />
              ) : (matches.data?.items.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  لا توجد جمعية مطابِقة حالياً ضمن النطاق والشروط.
                </p>
              ) : (
                <div className="space-y-3">
                  {matches.data!.items.slice(0, 3).map((m) => (
                    <MatchSuggestionCard key={m.charityId} charityName={m.name} score={m.score} reasons={m.reasons} components={m.components} />
                  ))}
                </div>
              )}
            </section>
          )}
          {live && (
            <Button variant="outline" block className="text-destructive" onClick={() => setCancelOpen(true)}>
              <Ban />
              إلغاء العرض
            </Button>
          )}
        </aside>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title="إلغاء العرض" description="تُلغى كل الحجوزات النشطة عليه وتُبلَّغ الجمعيات، دون أي خصم عليها.">
        <Field label="السبب (اختياري)" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="mt-3">
          <FormError error={cancel.error} />
        </div>
        <Button variant="destructive" block className="mt-4" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          تأكيد الإلغاء
        </Button>
      </Dialog>

      {rating && (
        <RatingDialog
          claimId={rating.id}
          targetName={rating.charity?.name ?? 'الجمعية'}
          open={!!rating}
          onOpenChange={(v) => !v && setRating(null)}
        />
      )}
    </>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium num">{value}</dd>
      </div>
    </div>
  );
}
