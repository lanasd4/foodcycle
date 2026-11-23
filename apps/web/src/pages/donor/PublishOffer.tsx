import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, MapPin, Plus, ShieldCheck } from 'lucide-react';
import { ALLERGENS, STORAGE_CONDITIONS, type Allergen, type StorageCondition } from '@foodcycle/shared';
import { UrgencyBadge } from '@/components/domain/domain';
import { LocationPicker } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { FormError, PageHeader, Spinner } from '@/components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtKg, toLocalInput } from '@/lib/format';
import { ALLERGEN_LABEL, STORAGE_META } from '@/lib/labels';
import type { Category, LatLng, Offer } from '@/lib/types';
import { cn } from '@/lib/utils';

const MIN_TRANSPORT = 30; // minutes; the server enforces the real value from settings

export default function PublishOffer() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/food-categories') });

  const [form, setForm] = useState(() => {
    const t = Date.now();
    return {
      categoryCode: 'COOKED',
      title: '',
      description: '',
      ingredients: '',
      storageCondition: 'HOT' as StorageCondition,
      storageInstructions: '',
      unit: 'kg' as 'kg' | 'portions',
      amount: '',
      preparedAt: toLocalInput(new Date(t - 30 * 60_000)),
      pickupBy: toLocalInput(new Date(t + 3 * 3_600_000)),
      approval: 'DEFAULT' as 'DEFAULT' | 'AUTO' | 'MANUAL',
    };
  });
  // ticks so the preview (time left, transport check) stays right while the form is open
  const now = useNow(30_000);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [noAllergens, setNoAllergens] = useState(false);
  const [otherLocation, setOtherLocation] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const category = categories.data?.find((c) => c.code === form.categoryCode);

  /** Same rules as the server, shown before submitting */
  const preview = useMemo(() => {
    if (!category) return null;
    const prepared = new Date(form.preparedAt);
    const pickup = new Date(form.pickupBy);
    const safeUntil = new Date(prepared.getTime() + category.safeHours * 3_600_000);
    const deadline = pickup < safeUntil ? pickup : safeUntil;
    const remaining = Math.floor((deadline.getTime() - now) / 60_000);
    const problems: string[] = [];
    if (prepared.getTime() > now + 2 * 60_000) problems.push('وقت التحضير في المستقبل.');
    if (pickup.getTime() <= Math.max(prepared.getTime(), now)) problems.push('آخر موعد للاستلام يجب أن يكون لاحقاً.');
    if (category.needsColdChain && form.storageCondition === 'ROOM_TEMP')
      problems.push(`«${category.name}» يحتاج حفظاً مبرّداً أو ساخناً.`);
    if (remaining < MIN_TRANSPORT) problems.push('لا يكفي الوقت المتبقي لنقل الطعام بأمان (30 دقيقة على الأقل).');
    return { deadline, remaining, cappedBySafety: safeUntil < pickup, problems };
  }, [category, form.preparedAt, form.pickupBy, form.storageCondition, now]);

  const amount = Number(form.amount);
  const kgEstimate = form.unit === 'kg' ? amount : category ? amount * category.portionKg : 0;
  const allergensOk = noAllergens || allergens.length > 0;
  const canSubmit =
    form.title.trim().length >= 2 && amount > 0 && allergensOk && (!otherLocation || location) && preview && preview.problems.length === 0;

  const publish = useMutation({
    mutationFn: () =>
      api.post<Offer>('/offers', {
        categoryCode: form.categoryCode,
        title: form.title.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.ingredients.trim() ? { ingredients: form.ingredients.trim() } : {}),
        allergens: noAllergens ? [] : allergens,
        allergensDeclared: allergensOk,
        storageCondition: form.storageCondition,
        ...(form.storageInstructions.trim() ? { storageInstructions: form.storageInstructions.trim() } : {}),
        ...(form.unit === 'kg' ? { quantityKg: amount } : { portions: Math.round(amount) }),
        preparedAt: new Date(form.preparedAt).toISOString(),
        pickupBy: new Date(form.pickupBy).toISOString(),
        ...(form.approval !== 'DEFAULT' ? { claimApprovalMode: form.approval } : {}),
        ...(otherLocation && location ? { location } : {}),
      }),
    onSuccess: (o) => {
      toast({ tone: 'success', title: 'تم نشر العرض', body: 'أُبلغت الجمعيات الأنسب فوراً.' });
      void qc.invalidateQueries({ queryKey: ['my-offers'] });
      navigate(`/donor/offers/${o.id}`, { replace: true });
    },
  });

  if (categories.isPending) return <Spinner />;

  return (
    <>
      <PageHeader title="نشر عرض جديد" subtitle="تفاصيل دقيقة = جمعيات أنسب واستلام أسرع." />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>الطعام</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم الطعام" htmlFor="title">
                <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="مثال: أرز بالدجاج" />
              </Field>
              <Field label="التصنيف" htmlFor="cat" hint={category ? `آمن ${category.safeHours} ساعة من التحضير` : undefined}>
                <Select
                  id="cat"
                  value={form.categoryCode}
                  onChange={(e) => {
                    const c = categories.data!.find((x) => x.code === e.target.value)!;
                    setForm((f) => ({
                      ...f,
                      categoryCode: c.code,
                      storageCondition: c.needsColdChain && f.storageCondition === 'ROOM_TEMP' ? 'REFRIGERATED' : f.storageCondition,
                    }));
                  }}
                >
                  {categories.data!.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الكمية" htmlFor="amount" hint={form.unit === 'portions' && kgEstimate > 0 ? `≈ ${fmtKg(kgEstimate)}` : undefined}>
                <div className="flex gap-2">
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className="num"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                  />
                  <Select className="w-28" value={form.unit} onChange={(e) => set('unit', e.target.value as 'kg' | 'portions')} aria-label="الوحدة">
                    <option value="kg">كغ</option>
                    <option value="portions">حصة</option>
                  </Select>
                </div>
              </Field>
              <Field label="طريقة الحفظ" htmlFor="storage">
                <Select id="storage" value={form.storageCondition} onChange={(e) => set('storageCondition', e.target.value as StorageCondition)}>
                  {STORAGE_CONDITIONS.map((s) => (
                    <option key={s} value={s} disabled={category?.needsColdChain && s === 'ROOM_TEMP'}>
                      {STORAGE_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="المكونات" htmlFor="ing">
                <Textarea id="ing" value={form.ingredients} onChange={(e) => set('ingredients', e.target.value)} placeholder="أرز بسمتي، دجاج، بازلاء، زبدة…" />
              </Field>
              <Field label="وصف أو تعليمات حفظ ونقل" htmlFor="desc">
                <Textarea id="desc" value={form.storageInstructions} onChange={(e) => set('storageInstructions', e.target.value)} placeholder="يُحفظ في حافظة حرارية، يُستهلك خلال ساعتين…" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>مسببات الحساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn('flex flex-wrap gap-2', noAllergens && 'pointer-events-none opacity-40')}>
                {ALLERGENS.map((a) => {
                  const on = allergens.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAllergens((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}
                      className={cn(
                        'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                        on ? 'border-transparent bg-allergen-soft text-allergen' : 'border-input bg-card text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {ALLERGEN_LABEL[a]}
                    </button>
                  );
                })}
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={noAllergens}
                  onChange={(e) => {
                    setNoAllergens(e.target.checked);
                    if (e.target.checked) setAllergens([]);
                  }}
                />
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-sm font-medium">أؤكد أن الطعام لا يحتوي على أي من مسببات الحساسية أعلاه</span>
              </label>
              {!allergensOk && <p className="text-xs text-muted-foreground">اختر المسببات الموجودة، أو أكّد عدم وجودها.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الوقت والاستلام</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="وقت التحضير" htmlFor="prep">
                <Input id="prep" type="datetime-local" className="num" value={form.preparedAt} onChange={(e) => set('preparedAt', e.target.value)} />
              </Field>
              <Field label="آخر موعد للاستلام" htmlFor="pickup">
                <Input id="pickup" type="datetime-local" className="num" value={form.pickupBy} onChange={(e) => set('pickupBy', e.target.value)} />
              </Field>
              <Field label="الموافقة على الطلبات" htmlFor="approval">
                <Select id="approval" value={form.approval} onChange={(e) => set('approval', e.target.value as typeof form.approval)}>
                  <option value="DEFAULT">حسب إعداد المطعم ({organization?.claimApprovalMode === 'MANUAL' ? 'يدوية' : 'تلقائية'})</option>
                  <option value="AUTO">تلقائية لهذا العرض</option>
                  <option value="MANUAL">يدوية لهذا العرض</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <label className="flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5">
                  <span className="text-sm">
                    <MapPin className="me-1.5 inline size-4 text-muted-foreground" />
                    موقع استلام مختلف
                  </span>
                  <Switch checked={otherLocation} onCheckedChange={setOtherLocation} aria-label="موقع استلام مختلف" />
                </label>
              </div>
              {otherLocation && (
                <div className="sm:col-span-2">
                  <LocationPicker value={location} onChange={setLocation} city={organization!.city} focus={organization!.location} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* live summary */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>قبل النشر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {preview && (
                <div className="rounded-lg bg-muted p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-4" />
                      الحد الآمن للاستلام
                    </span>
                    {preview.remaining > 0 && <UrgencyBadge remainingMinutes={preview.remaining} />}
                  </div>
                  <p className="mt-1.5 font-semibold num">{fmtDateTime(preview.deadline)}</p>
                  {preview.cappedBySafety && (
                    <p className="mt-1 text-xs text-muted-foreground">حُدّد بمدة أمان الصنف لا بالموعد الذي اخترته.</p>
                  )}
                </div>
              )}
              {preview?.problems.map((p) => (
                <p key={p} className="flex gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {p}
                </p>
              ))}
              {kgEstimate > 0 && (
                <p className="text-sm text-muted-foreground num">
                  الكمية: <span className="font-semibold text-foreground">{fmtKg(kgEstimate)}</span>
                </p>
              )}
              <FormError error={publish.error} />
              <Button block size="lg" disabled={!canSubmit || publish.isPending} onClick={() => publish.mutate()}>
                <Plus />
                {publish.isPending ? 'جارٍ النشر…' : 'نشر العرض'}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

