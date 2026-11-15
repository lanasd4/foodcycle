import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, HandHeart, MapPin, Utensils } from 'lucide-react';
import { AllergenChips, StorageBadge, UrgencyBadge } from '@/components/domain/domain';
import { PointsMap } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { ErrorState, FormError, Spinner } from '@/components/ui/feedback';
import { Badge, Card, CardContent, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtKg, fmtTime } from '@/lib/format';
import type { Claim, Offer } from '@/lib/types';

export default function CharityOffer() {
  const { id } = useParams();
  const { organization } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const offer = useQuery({ queryKey: ['offer', id], queryFn: () => api.get<Offer>(`/offers/${id}`) });
  const [kg, setKg] = useState('');

  const claim = useMutation({
    mutationFn: () => api.post<Claim>(`/offers/${id}/claims`, { quantityKg: Number(kg) }),
    onSuccess: (c) => {
      toast(
        c.status === 'RESERVED'
          ? { tone: 'success', title: 'تم الحجز', body: `اعرضوا رمز QR عند الاستلام قبل ${fmtTime(c.reservedUntil!)}.` }
          : { tone: 'info', title: 'أُرسل الطلب', body: 'بانتظار موافقة الجهة المانحة. سيصلكم إشعار فوري.' },
      );
      for (const k of ['claims', 'recommended', 'offers', 'offer']) void qc.invalidateQueries({ queryKey: [k] });
      navigate(`/charity/claims/${c.id}`);
    },
  });

  if (offer.isPending) return <Spinner />;
  if (offer.isError) return <ErrorState error={offer.error} />;
  const o = offer.data;
  const amount = Number(kg);
  const valid = amount > 0 && amount <= o.remainingKg;
  const available = o.status === 'PUBLISHED' && o.remainingKg > 0;

  return (
    <>
      <Link to="/charity" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4 ltr:rotate-180" />
        العروض
      </Link>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <UrgencyBadge remainingMinutes={o.remainingMinutes} />
                <Badge tone="outline">{o.category?.name}</Badge>
                <StorageBadge condition={o.storageCondition} />
              </div>
              <h1 className="mt-3 text-2xl font-bold">{o.title}</h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-muted-foreground">
                <Utensils className="size-4" />
                {o.donorName}
              </p>
              {o.ingredients && <p className="mt-4 text-sm">المكونات: {o.ingredients}</p>}
              {o.storageInstructions && <p className="mt-1 text-sm text-muted-foreground">{o.storageInstructions}</p>}
              <div className="mt-4">
                <AllergenChips allergens={o.allergens} />
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex gap-2.5">
                  <Clock className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">استلام قبل</dt>
                    <dd className="font-medium num">{fmtDateTime(o.effectiveDeadline)}</dd>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">موقع الاستلام</dt>
                    <dd className="font-medium">
                      {o.area} · {o.pickupAddress}
                    </dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>
          <PointsMap
            className="h-64"
            points={[
              { position: o.location, label: `${o.donorName}: ${o.pickupAddress}` },
              ...(organization ? [{ position: organization.location, label: organization.name, tone: 'accent' as const }] : []),
            ]}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">المتاح الآن</p>
                <p className="text-3xl font-bold num">{fmtKg(o.remainingKg)}</p>
              </div>
              {available ? (
                <>
                  <Field label="الكمية التي تحتاجونها (كغ)" htmlFor="kg">
                    <Input
                      id="kg"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={o.remainingKg}
                      step="0.5"
                      className="num"
                      value={kg}
                      onChange={(e) => setKg(e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {[0.25, 0.5, 1].map((f) => {
                      const v = Math.round(o.remainingKg * f * 2) / 2;
                      return v > 0 ? (
                        <Button key={f} size="sm" variant="secondary" onClick={() => setKg(String(v))} className="num">
                          {f === 1 ? 'الكل' : fmtKg(v)}
                        </Button>
                      ) : null;
                    })}
                  </div>
                  <FormError error={claim.error} />
                  <Button block size="lg" disabled={!valid || claim.isPending} onClick={() => claim.mutate()}>
                    <HandHeart />
                    {claim.isPending ? 'جارٍ الحجز…' : 'طلب استلام'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {o.effectiveApprovalMode === 'MANUAL'
                      ? 'تحتاج هذه الجهة للموافقة على الطلب أولاً.'
                      : 'يُحجز الطعام فوراً لكم لفترة محددة، فاحضروا في الوقت.'}
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">هذا العرض غير متاح للحجز حالياً.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
