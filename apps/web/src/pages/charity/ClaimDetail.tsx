import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowRight, Ban, Clock, Hourglass, MapPin, Navigation, Star } from 'lucide-react';
import { RatingDialog } from '@/components/app/RatingDialog';
import { useCountdown } from '@/lib/clock';
import { AllergenChips, ClaimStatusBadge, StorageBadge } from '@/components/domain/domain';
import { PointsMap } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { ErrorState, FormError, Spinner } from '@/components/ui/feedback';
import { Card, CardContent } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fmtCountdown, fmtDateTime, fmtKg } from '@/lib/format';
import type { Claim } from '@/lib/types';

/** The charity's reservation: QR + 6-digit code to show at pickup, live countdown, directions. */
export default function ClaimDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [rateOpen, setRateOpen] = useState(false);
  const q = useQuery({ queryKey: ['claim', id], queryFn: () => api.get<Claim>(`/claims/${id}`), refetchInterval: 30_000 });

  const cancel = useMutation({
    mutationFn: () => api.delete<Claim>(`/claims/${id}`),
    onSuccess: () => {
      toast({ tone: 'info', title: 'أُلغي الحجز', body: 'عادت الكمية للعرض لجمعيات أخرى.' });
      for (const k of ['claim', 'claims', 'recommended', 'offers']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} />;
  const c = q.data;
  const active = c.status === 'RESERVED' || c.status === 'PENDING_APPROVAL';

  return (
    <div className="mx-auto max-w-lg">
      <Link to="/charity/claims" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4 ltr:rotate-180" />
        حجوزاتي
      </Link>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold">{c.offer?.title}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground num">
                {c.offer?.donorName} · {fmtKg(c.quantityKg)}
              </p>
            </div>
            <ClaimStatusBadge status={c.status} />
          </div>

          {c.status === 'RESERVED' && c.qrPayload && <PickupPass claim={c} />}
          {c.status === 'PENDING_APPROVAL' && <Waiting claim={c} />}
          {c.status === 'REJECTED' && c.rejectReason && (
            <p className="mt-4 rounded-lg bg-muted p-3 text-sm">سبب الرفض: {c.rejectReason}</p>
          )}
          {c.status === 'PICKED_UP' && !c.ratedByMe && (
            <Button className="mt-5" block variant="soft" onClick={() => setRateOpen(true)}>
              <Star />
              قيّموا {c.offer?.donorName}
            </Button>
          )}
        </CardContent>
      </Card>

      {c.offer && (
        <Card className="mt-4">
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-2.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {c.offer.area} · {c.offer.pickupAddress}
              </span>
            </div>
            <div className="flex gap-2.5 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="num">الحد الآمن للعرض: {fmtDateTime(c.offer.effectiveDeadline)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StorageBadge condition={c.offer.storageCondition} />
            </div>
            <AllergenChips allergens={c.offer.allergens} />
            <PointsMap points={[{ position: c.offer.location, label: c.offer.pickupAddress }]} />
            {active && (
              <Button asChild variant="outline" block>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${c.offer.location.lat},${c.offer.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation />
                  الاتجاهات
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {active && (
        <>
          <div className="mt-4">
            <FormError error={cancel.error} />
          </div>
          <Button
            variant="ghost"
            block
            className="mt-2 text-destructive"
            disabled={cancel.isPending}
            onClick={() => {
              if (confirm('إلغاء الحجز؟ ستعود الكمية للعرض.')) cancel.mutate();
            }}
          >
            <Ban />
            إلغاء الحجز
          </Button>
        </>
      )}

      <RatingDialog claimId={c.id} targetName={c.offer?.donorName ?? 'الجهة المانحة'} open={rateOpen} onOpenChange={setRateOpen} />
    </div>
  );
}

function PickupPass({ claim }: { claim: Claim }) {
  const [svg, setSvg] = useState('');
  const left = useCountdown(claim.reservationSecondsLeft);
  useEffect(() => {
    void QRCode.toString(claim.qrPayload!, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg);
  }, [claim.qrPayload]);

  const urgent = left != null && left < 10 * 60;
  return (
    <div className="mt-5 text-center">
      {/* always black on white: scanners need maximum contrast, in dark mode too */}
      <div
        className="mx-auto w-full max-w-64 rounded-2xl bg-white p-3"
        role="img"
        aria-label="رمز QR للاستلام"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-4 text-sm text-muted-foreground">أو أعطوا هذا الرمز للجهة المانحة</p>
      <p className="mt-1 text-4xl font-bold tracking-[0.3em] num" dir="ltr">
        {claim.pickupCode}
      </p>
      {left != null && (
        <p className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold num ${urgent ? 'bg-urgency-critical-soft text-urgency-critical' : 'bg-claim-reserved-soft text-claim-reserved'}`}>
          <Clock className="size-4" />
          {left > 0 ? `الاستلام خلال ${fmtCountdown(left)}` : 'انتهت مدة الحجز'}
        </p>
      )}
    </div>
  );
}

function Waiting({ claim }: { claim: Claim }) {
  const left = useCountdown(claim.approvalSecondsLeft);
  return (
    <div className="mt-5 rounded-xl bg-claim-pending-soft p-5 text-center text-claim-pending">
      <Hourglass className="mx-auto size-8" />
      <p className="mt-3 font-semibold">بانتظار موافقة الجهة المانحة</p>
      <p className="mt-1 text-sm num">
        {left != null && left > 0 ? `يُلغى تلقائياً خلال ${fmtCountdown(left)} إن لم يُرد عليه` : 'انتهت المهلة'}
      </p>
      <p className="mt-3 text-xs opacity-80">سيصلكم إشعار فوري عند الرد، ويظهر رمز QR هنا.</p>
    </div>
  );
}
