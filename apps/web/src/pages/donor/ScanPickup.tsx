import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CheckCircle2, Keyboard, ScanLine, Star } from 'lucide-react';
import { RatingDialog } from '@/components/app/RatingDialog';
import { Button } from '@/components/ui/button';
import { FormError, PageHeader } from '@/components/ui/feedback';
import { Card, CardContent, Field, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtKg } from '@/lib/format';
import type { Claim, Offer, Page } from '@/lib/types';

/**
 * The donor confirms a pickup: scan the QR the charity shows,
 * or type the 6-digit code if the camera does not cooperate.
 */
export default function ScanPickup() {
  const qc = useQueryClient();
  const [done, setDone] = useState<Claim | null>(null);
  const [rateOpen, setRateOpen] = useState(false);

  const confirm = useMutation({
    mutationFn: (body: { qrToken: string } | { offerId: string; pickupCode: string }) =>
      api.post<Claim>('/claims/confirm-pickup', body),
    onSuccess: (c) => {
      setDone(c);
      for (const k of ['my-offers', 'incoming', 'offer', 'impact']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <CardContent className="p-8">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-claim-picked-soft text-claim-picked">
              <CheckCircle2 className="size-9" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">تم تأكيد الاستلام</h1>
            <p className="mt-2 text-muted-foreground num">
              استلمت {done.charity?.name} {fmtKg(done.quantityKg)} من «{done.offer?.title}». شكراً لكم!
            </p>
            <div className="mt-6 grid gap-2">
              <Button onClick={() => setRateOpen(true)}>
                <Star />
                قيّم {done.charity?.name}
              </Button>
              <Button variant="outline" onClick={() => setDone(null)}>
                <ScanLine />
                استلام آخر
              </Button>
              <Button asChild variant="ghost">
                <Link to="/donor">العودة لعروضي</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <RatingDialog claimId={done.id} targetName={done.charity?.name ?? 'الجمعية'} open={rateOpen} onOpenChange={setRateOpen} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="تأكيد الاستلام" subtitle="امسح رمز الجمعية عند تسليم الطعام." />
      <Tabs defaultValue="scan">
        <TabsList className="w-full">
          <TabsTrigger value="scan" className="flex-1">
            <Camera className="size-4" />
            مسح QR
          </TabsTrigger>
          <TabsTrigger value="code" className="flex-1">
            <Keyboard className="size-4" />
            إدخال الرمز
          </TabsTrigger>
        </TabsList>
        <TabsContent value="scan" className="mt-5">
          <Scanner onCode={(text) => !confirm.isPending && confirm.mutate({ qrToken: text })} />
        </TabsContent>
        <TabsContent value="code" className="mt-5">
          <CodeForm onSubmit={(offerId, pickupCode) => confirm.mutate({ offerId, pickupCode })} busy={confirm.isPending} />
        </TabsContent>
      </Tabs>
      <div className="mt-4">
        <FormError error={confirm.error} />
      </div>
    </div>
  );
}

function Scanner({ onCode }: { onCode: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef('');
  // latest callback without restarting the camera on every render
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scanner = new Html5Qrcode(el.id, { verbose: false });
    let running = false;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (text) => {
          // the same code is read many times per second: send it once
          if (text !== last.current && text.startsWith('FC1:')) {
            last.current = text;
            onCodeRef.current(text);
          }
        },
        () => undefined,
      )
      .then(() => (running = true))
      .catch(() => setError('لا يمكن فتح الكاميرا. اسمح بالوصول إليها، أو استخدم إدخال الرمز.'));
    return () => {
      if (running) void scanner.stop().catch(() => undefined);
    };
  }, []);

  return (
    <div>
      <div id="qr-reader" ref={ref} className="aspect-square overflow-hidden rounded-2xl border bg-black" />
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function CodeForm({ onSubmit, busy }: { onSubmit: (offerId: string, code: string) => void; busy: boolean }) {
  const offers = useQuery({
    queryKey: ['my-offers'],
    queryFn: () => api.get<Page<Offer>>('/offers/mine', { limit: 50 }),
  });
  const live = (offers.data?.items ?? []).filter((o) => o.status === 'PUBLISHED' || o.status === 'RESERVED');
  const [offerId, setOfferId] = useState('');
  const [code, setCode] = useState('');
  const chosen = offerId || live[0]?.id || '';

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(chosen, code);
      }}
    >
      <Field label="العرض" htmlFor="offer">
        <Select id="offer" value={chosen} onChange={(e) => setOfferId(e.target.value)}>
          {live.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="رمز الاستلام" htmlFor="code" hint="6 أرقام تظهر عند الجمعية تحت رمز QR">
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          className="text-center text-2xl font-bold tracking-[0.5em] num"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <Button type="submit" block size="lg" disabled={!chosen || code.length !== 6 || busy}>
        تأكيد الاستلام
      </Button>
    </form>
  );
}
