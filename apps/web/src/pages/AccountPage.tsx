import { useMutation, useQuery } from '@tanstack/react-query';
import { MapPin, Phone, ShieldCheck, Star } from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@/components/ui/primitives';
import { FormError, PageHeader } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { PointsMap } from '@/components/map/Map';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, ORG_TYPE_LABEL } from '@/lib/format';
import type { Organization } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Received {
  count: number;
  average: number | null;
  trustScore: number;
  items: { score: number; comment: string | null; createdAt: string; fromName: string }[];
}

export default function AccountPage() {
  const { user, organization, setOrganization } = useAuth();
  const toast = useToast();
  const ratings = useQuery({
    queryKey: ['ratings'],
    queryFn: () => api.get<Received>('/ratings/received'),
    enabled: user?.role !== 'ADMIN',
  });
  const mode = useMutation({
    mutationFn: (manual: boolean) =>
      api.patch<Organization>('/organizations/me/settings', { claimApprovalMode: manual ? 'MANUAL' : 'AUTO' }),
    onSuccess: (o) => {
      setOrganization(o);
      toast({ tone: 'success', title: 'حُفظ الإعداد' });
    },
  });

  if (user?.role === 'ADMIN') {
    return <PageHeader title="حسابي" subtitle={user.email} />;
  }
  const o = organization!;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="حسابي" />
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{o.name}</h2>
                <Badge tone="primary">
                  <ShieldCheck />
                  موثّقة
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {ORG_TYPE_LABEL[o.type]} · منذ {fmtDate(o.createdAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {o.area} · {o.address}
                </span>
                <span className="inline-flex items-center gap-1.5" dir="ltr">
                  <Phone className="size-4" />
                  {o.phone}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-accent-soft px-5 py-3 text-center">
              <p className="text-xs text-accent-soft-foreground">درجة الالتزام</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-2xl font-bold num">
                <Star className="size-5 fill-accent text-accent" />
                {o.trustScore.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        {user?.role === 'DONOR' && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>الموافقة على طلبات الاستلام</CardTitle>
              <CardDescription>يمكن تغييرها لعرض واحد عند النشر.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/40 p-4">
                <div>
                  <p className="font-semibold">موافقة يدوية</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {o.claimApprovalMode === 'MANUAL'
                      ? 'تصلكم الطلبات للموافقة، وتُلغى تلقائياً إن لم تردّوا خلال المهلة.'
                      : 'تُقبل الطلبات تلقائياً ويُحجز الطعام فوراً للجمعية.'}
                  </p>
                </div>
                <Switch
                  checked={o.claimApprovalMode === 'MANUAL'}
                  disabled={mode.isPending}
                  onCheckedChange={(v) => mode.mutate(v)}
                  aria-label="موافقة يدوية"
                />
              </div>
              <div className="mt-3">
                <FormError error={mode.error} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>التقييمات</CardTitle>
            <CardDescription className="num">
              {ratings.data?.count ? `${ratings.data.count} تقييم · المتوسط ${ratings.data.average}` : 'لا تقييمات بعد'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ratings.data?.items.slice(0, 6).map((r, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.fromName}</span>
                  <span className="flex" aria-label={`${r.score} من 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn('size-3.5', n <= r.score ? 'fill-accent text-accent' : 'text-input')} />
                    ))}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <PointsMap className="h-full min-h-56" points={[{ position: o.location, label: o.address }]} />
      </div>
    </div>
  );
}
