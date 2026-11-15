import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormError, PageHeader, Spinner } from '@/components/ui/feedback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Category, CharityNeeds } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * What the charity accepts, prefers, can handle per day, and when it can pick up.
 * Feeds the Smart Matching: better needs = better suggestions and fewer irrelevant alerts.
 */
export default function NeedsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/food-categories') });
  const needs = useQuery({ queryKey: ['needs'], queryFn: () => api.get<CharityNeeds | null>('/charity-needs/me') });

  const [accepted, setAccepted] = useState<string[]>([]);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [capacity, setCapacity] = useState('');
  const [hoursOn, setHoursOn] = useState(false);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('21:00');

  useEffect(() => {
    if (!needs.isSuccess) return;
    const n = needs.data;
    if (n) {
      setAccepted(n.acceptedCategories);
      setPreferred(n.preferredCategories);
      setCapacity(n.dailyCapacityKg ? String(n.dailyCapacityKg) : '');
      setHoursOn(!!n.pickupHours);
      if (n.pickupHours) {
        setStart(n.pickupHours.start);
        setEnd(n.pickupHours.end);
      }
    } else if (categories.data) {
      setAccepted(categories.data.map((c) => c.code));
    }
  }, [needs.isSuccess, needs.data, categories.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<CharityNeeds>('/charity-needs/me', {
        acceptedCategories: accepted,
        preferredCategories: preferred.filter((p) => accepted.includes(p)),
        dailyCapacityKg: capacity ? Number(capacity) : null,
        pickupHours: hoursOn ? { start, end } : null,
      }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'حُفظت الاحتياجات', body: 'ستُطابَق العروض الجديدة معها.' });
      void qc.invalidateQueries({ queryKey: ['needs'] });
      void qc.invalidateQueries({ queryKey: ['recommended'] });
    },
  });

  if (categories.isPending || needs.isPending) return <Spinner />;

  function toggleAccepted(code: string) {
    setAccepted((xs) => (xs.includes(code) ? xs.filter((x) => x !== code) : [...xs, code]));
    setPreferred((xs) => xs.filter((x) => x !== code || !accepted.includes(code)));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="احتياجاتنا" subtitle="تحدد العروض التي تُقترح عليكم والتي يصلكم إشعار بها." />
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>الأصناف</CardTitle>
            <CardDescription>
              اختاروا ما تقبلونه، وعلّموا بالقلب ما تحتاجونه أكثر (يرفع ترتيب هذه العروض).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {categories.data!.map((c) => {
              const on = accepted.includes(c.code);
              const fav = preferred.includes(c.code);
              return (
                <div
                  key={c.code}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors',
                    on ? 'border-primary/40 bg-primary-soft/50' : 'bg-card',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAccepted(c.code)}
                    className="flex flex-1 cursor-pointer items-center gap-2.5 text-start"
                  >
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-md border',
                        on ? 'border-transparent bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="text-sm font-medium">{c.name}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!on}
                    aria-pressed={fav}
                    aria-label={`نحتاج ${c.name} أكثر`}
                    onClick={() => setPreferred((xs) => (fav ? xs.filter((x) => x !== c.code) : [...xs, c.code]))}
                    className="cursor-pointer rounded-md p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Heart className={cn('size-4', fav ? 'fill-destructive text-destructive' : 'text-muted-foreground')} />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>السعة والوقت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="السعة اليومية (كغ)" htmlFor="cap" hint="أقصى ما تستطيعون توزيعه يومياً. اتركوه فارغاً إن لم يكن هناك حد.">
              <Input id="cap" type="number" inputMode="decimal" min={0} className="num" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <div>
                <p className="text-sm font-medium">ساعات استلام محددة</p>
                <p className="text-xs text-muted-foreground">لن تُقترح عروض لا يمكن استلامها ضمن هذه الساعات.</p>
              </div>
              <Switch checked={hoursOn} onCheckedChange={setHoursOn} aria-label="ساعات استلام محددة" />
            </div>
            {hoursOn && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="من" htmlFor="start">
                  <Input id="start" type="time" className="num" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label="إلى" htmlFor="end" hint={end < start ? 'تعبر منتصف الليل' : undefined}>
                  <Input id="end" type="time" className="num" value={end} onChange={(e) => setEnd(e.target.value)} />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>

        <FormError error={save.error} />
        <Button size="lg" block disabled={accepted.length === 0 || save.isPending} onClick={() => save.mutate()}>
          <Save />
          {save.isPending ? 'جارٍ الحفظ…' : 'حفظ الاحتياجات'}
        </Button>
      </div>
    </div>
  );
}
