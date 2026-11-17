import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, HandHeart, Star, X } from 'lucide-react';
import { ClaimStatusBadge } from '@/components/domain/domain';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/feedback';
import { Card, CardContent, Field, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useCountdown } from '@/lib/clock';
import { fmtCountdown, fmtKg, fmtRelative } from '@/lib/format';
import type { Claim } from '@/lib/types';

/** A charity's request as the donor sees it, with approve / reject when pending. */
export function IncomingClaim({ claim, showOffer = true }: { claim: Claim; showOffer?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const left = useCountdown(claim.approvalSecondsLeft);

  const refresh = () => {
    for (const k of ['incoming', 'claims', 'my-offers', 'offer']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const approve = useMutation({
    mutationFn: () => api.post(`/claims/${claim.id}/approve`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'تمت الموافقة', body: `أُبلغت ${claim.charity?.name}.` });
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/claims/${claim.id}/reject`, reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: () => {
      toast({ tone: 'info', title: 'تم رفض الطلب', body: 'عادت الكمية للعرض.' });
      setRejecting(false);
      refresh();
    },
  });

  const pending = claim.status === 'PENDING_APPROVAL';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-claim-pending-soft text-claim-pending">
            <HandHeart className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate font-semibold">{claim.charity?.name}</p>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground num">
              تطلب {fmtKg(claim.quantityKg)}
              {showOffer && claim.offer ? ` من «${claim.offer.title}»` : ''} · {fmtRelative(claim.createdAt)}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground num">
              <Star className="size-3.5 fill-accent text-accent" />
              التزام {claim.charity?.trustScore.toFixed(1)} من 5
            </p>
            {pending && left != null && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground num">
                <span className="inline-block size-2 animate-pulse rounded-full bg-claim-pending" />
                يُلغى تلقائياً خلال {fmtCountdown(left)}
              </div>
            )}
          </div>
        </div>
        {pending && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending || left === 0}>
              <Check />
              موافقة
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejecting(true)}>
              <X />
              رفض
            </Button>
          </div>
        )}
        {approve.error && (
          <div className="mt-3">
            <FormError error={approve.error} />
          </div>
        )}
      </CardContent>

      <Dialog open={rejecting} onOpenChange={setRejecting} title="رفض الطلب" description={`ستعود الكمية للعرض وتُبلَّغ ${claim.charity?.name}.`}>
        <Field label="السبب (اختياري)" htmlFor="reason">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="mt-3">
          <FormError error={reject.error} />
        </div>
        <Button variant="destructive" block className="mt-4" disabled={reject.isPending} onClick={() => reject.mutate()}>
          تأكيد الرفض
        </Button>
      </Dialog>
    </Card>
  );
}
