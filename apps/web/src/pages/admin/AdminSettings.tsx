import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, FormError, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Weights = { dist: number; type: number; qty: number; time: number; trust: number };
type Settings = Record<string, number | string> & { weights: Weights; weights_version: number };

const NUMBERS: { key: string; label: string; hint?: string; unit: string }[] = [
  { key: 'reservation_minutes', label: 'مدة الحجز', unit: 'دقيقة', hint: 'وقت الجمعية للاستلام بعد الحجز' },
  { key: 'approval_timeout_minutes', label: 'مهلة الموافقة اليدوية', unit: 'دقيقة' },
  { key: 'min_transport_minutes', label: 'أقل وقت للنقل', unit: 'دقيقة', hint: 'يُخفى العرض إن بقي أقل من ذلك' },
  { key: 'service_radius_km', label: 'نصف قطر الخدمة', unit: 'كم' },
  { key: 'urgency_critical_minutes', label: 'عتبة «حرج»', unit: 'دقيقة' },
  { key: 'urgency_soon_minutes', label: 'عتبة «قريب»', unit: 'دقيقة' },
  { key: 'max_active_claims_per_charity', label: 'حجوزات نشطة لكل جمعية', unit: 'حجز' },
  { key: 'no_show_penalty', label: 'خصم عدم الحضور', unit: 'نقطة' },
  { key: 'avg_speed_kmh', label: 'متوسط سرعة النقل', unit: 'كم/س' },
  { key: 'max_offer_notifications', label: 'جمعيات تُبلَّغ بكل عرض', unit: 'جمعية' },
];

const WEIGHTS: { key: keyof Weights; label: string }[] = [
  { key: 'dist', label: 'المسافة' },
  { key: 'type', label: 'نوع الطعام' },
  { key: 'qty', label: 'الكمية' },
  { key: 'time', label: 'الوقت' },
  { key: 'trust', label: 'الالتزام' },
];

/** Tune thresholds and matching weights without touching code. Every change is audited. */
export default function AdminSettings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/admin/settings') });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  // re-mount after each save so the form starts from the saved values
  return <SettingsForm key={q.data.weights_version + JSON.stringify(q.data)} settings={q.data} />;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMBERS.map((n) => [n.key, String(settings[n.key])])),
  );
  const [weights, setWeights] = useState<Record<keyof Weights, string>>(
    () => Object.fromEntries(WEIGHTS.map((w) => [w.key, String(settings.weights[w.key])])) as Record<keyof Weights, string>,
  );

  const sum = WEIGHTS.reduce((a, w) => a + (Number(weights[w.key]) || 0), 0);
  const sumOk = Math.abs(sum - 1) < 0.001;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const n of NUMBERS) if (Number(values[n.key]) !== Number(settings[n.key])) body[n.key] = Number(values[n.key]);
      const w = Object.fromEntries(WEIGHTS.map((x) => [x.key, Number(weights[x.key])])) as Weights;
      if (WEIGHTS.some((x) => w[x.key] !== settings.weights[x.key])) body.weights = w;
      return api.patch<Settings>('/admin/settings', body);
    },
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      toast({ tone: 'success', title: 'حُفظت الإعدادات', body: 'تطبّق خلال 30 ثانية.' });
    },
  });

  const dirty =
    NUMBERS.some((n) => Number(values[n.key]) !== Number(settings[n.key])) ||
    WEIGHTS.some((w) => Number(weights[w.key]) !== settings.weights[w.key]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="الإعدادات" subtitle="العتبات وأوزان المطابقة. كل تغيير يُسجَّل في سجل التدقيق." />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>العتبات والمهل</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {NUMBERS.map((n) => (
              <Field key={n.key} label={`${n.label} (${n.unit})`} hint={n.hint} htmlFor={n.key}>
                <Input
                  id={n.key}
                  type="number"
                  step="any"
                  className="num"
                  value={values[n.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [n.key]: e.target.value })}
                />
              </Field>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                أوزان المطابقة <Badge tone="outline" className="num">v{settings.weights_version}</Badge>
              </CardTitle>
              <CardDescription>مجموعها يجب أن يساوي 1. تغييرها يرفع رقم النسخة.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {WEIGHTS.map((w) => (
                <div key={w.key} className="flex items-center gap-3">
                  <label htmlFor={`w-${w.key}`} className="w-20 text-sm">
                    {w.label}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number(weights[w.key]) || 0}
                    onChange={(e) => setWeights({ ...weights, [w.key]: e.target.value })}
                    className="flex-1 accent-[var(--primary)]"
                    aria-label={w.label}
                  />
                  <Input
                    id={`w-${w.key}`}
                    className="h-9 w-20 text-center num"
                    value={weights[w.key]}
                    onChange={(e) => setWeights({ ...weights, [w.key]: e.target.value })}
                  />
                </div>
              ))}
              <p className={cn('rounded-lg px-3 py-2 text-sm font-semibold num', sumOk ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-urgency-critical-soft text-destructive')}>
                المجموع: {sum.toFixed(2)} {sumOk ? '✓' : '(يجب أن يساوي 1)'}
              </p>
            </CardContent>
          </Card>
          <FormError error={save.error} />
          <Button block size="lg" disabled={!dirty || !sumOk || save.isPending} onClick={() => save.mutate()}>
            <Save />
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </Button>
        </div>
      </div>
    </div>
  );
}
