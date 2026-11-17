import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { CircleMarker, MapContainer, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, HandHeart, Scale, TrendingDown, Utensils } from 'lucide-react';
import { StatTile } from '@/components/domain/domain';
import { cssVar, DAMASCUS, Tiles } from '@/components/map/Map';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtKg, fmtNumber, ORG_TYPE_LABEL } from '@/lib/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface Summary {
  kgSaved: number;
  donations: number;
  activeDonors: number;
  activeCharities: number;
  offersPublished: number;
  kgPublished: number;
  kgExpiredUnclaimed: number;
  lossRate: number | null;
  change: { kgSaved: number | null; donations: number | null; activeDonors: number | null; activeCharities: number | null };
}
interface TopDonor {
  rank: number;
  donorId: string;
  name: string;
  type: string;
  area: string;
  kgSaved: number;
  donations: number;
  charitiesServed: number;
}
interface AreaNeed {
  area: string;
  charities: number;
  requestedKg: number | null;
  receivedKg: number;
  needIndex: number | null;
  location: { lat: number; lng: number };
}

const PERIODS = { 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 3 أشهر', 365: 'آخر سنة' } as const;

function delta(v: number | null) {
  if (v == null || v === 0) return undefined;
  const abs = Math.abs(v);
  return { value: `${abs >= 10 ? Math.round(abs) : abs}%`, positive: v > 0 };
}

export default function AdminDashboard() {
  const [days, setDays] = useState<keyof typeof PERIODS>(30);
  // the period ends "now" at fetch time, so a refetch is never stale
  const period = () => {
    const to = new Date();
    return { from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString() };
  };
  const bucket = days <= 30 ? 'day' : days <= 90 ? 'week' : 'month';

  const summary = useQuery({ queryKey: ['analytics', 'summary', days], queryFn: () => api.get<Summary>('/analytics/summary', period()) });
  const trend = useQuery({
    queryKey: ['analytics', 'trend', days],
    queryFn: () => api.get<{ points: { start: string; kgSaved: number }[] }>('/analytics/trend', { ...period(), bucket }),
  });
  const donors = useQuery({
    queryKey: ['analytics', 'donors', days],
    queryFn: () => api.get<{ items: TopDonor[] }>('/analytics/top-donors', { ...period(), limit: 5 }),
  });
  const areas = useQuery({
    queryKey: ['analytics', 'areas', days],
    queryFn: () => api.get<{ items: AreaNeed[] }>('/analytics/need-by-area', period()),
  });

  const s = summary.data;
  return (
    <>
      <PageHeader
        title="لوحة الأثر"
        subtitle="ما أنقذته المنصة فعلاً: الاستلام المؤكَّد فقط."
        action={
          <Select className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value) as keyof typeof PERIODS)} aria-label="الفترة">
            {Object.entries(PERIODS).map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
          </Select>
        }
      />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {s ? (
            <>
              <StatTile label="طعام تم إنقاذه" value={fmtNumber(s.kgSaved)} unit="كغ" icon={Scale} delta={delta(s.change.kgSaved)} />
              <StatTile label="تبرعات ناجحة" value={String(s.donations)} icon={HandHeart} delta={delta(s.change.donations)} />
              <StatTile label="جهات مانحة نشطة" value={String(s.activeDonors)} icon={Utensils} delta={delta(s.change.activeDonors)} />
              <StatTile label="جمعيات مستفيدة" value={String(s.activeCharities)} icon={Building2} delta={delta(s.change.activeCharities)} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الطعام المُنقذ عبر الزمن</CardTitle>
            <CardDescription>بالكيلوغرام، حسب {bucket === 'day' ? 'اليوم' : bucket === 'week' ? 'الأسبوع' : 'الشهر'}</CardDescription>
          </CardHeader>
          <CardContent className="h-72">{trend.data ? <TrendChart points={trend.data.points} /> : <Skeleton className="size-full" />}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الفاقد</CardTitle>
            <CardDescription>طعام نُشر وانتهى دون أن يُحجز</CardDescription>
          </CardHeader>
          <CardContent>
            {s && (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold num">{s.lossRate == null ? '—' : `${Math.round(s.lossRate * 100)}%`}</span>
                  <TrendingDown className="size-5 text-muted-foreground" />
                </p>
                <p className="mt-2 text-sm text-muted-foreground num">
                  {fmtKg(s.kgExpiredUnclaimed)} من أصل {fmtKg(s.kgPublished)} منشورة · {s.offersPublished} عرض
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-urgency-critical" style={{ width: `${Math.round((s.lossRate ?? 0) * 100)}%` }} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>المناطق الأكثر احتياجاً</CardTitle>
            <CardDescription>مؤشر الحاجة = 1 − المُستلم ÷ السعة المعلنة. كلما كبرت الدائرة واحمرّت زادت الحاجة.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_14rem]">
            <NeedMap areas={areas.data?.items ?? []} />
            <ol className="space-y-2">
              {areas.data?.items.map((a) => (
                <li key={a.area} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{a.area}</span>
                    <span className="text-sm font-bold num">{a.needIndex == null ? '—' : `${Math.round(a.needIndex * 100)}%`}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground num">
                    {a.charities} جمعية · استلمت {fmtKg(a.receivedKg)}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الأكثر مساهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {donors.data?.items.length === 0 && <p className="text-sm text-muted-foreground">لا بيانات في هذه الفترة.</p>}
            {donors.data?.items.map((d) => (
              <div key={d.donorId} className="flex items-center gap-3 rounded-lg border p-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground num">
                  {d.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORG_TYPE_LABEL[d.type]} · {d.area}
                  </p>
                </div>
                <span className="text-sm font-bold num">{fmtKg(d.kgSaved)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Bars, not a smoothed line: daily totals are discrete, a curve would invent values between days. */
function TrendChart({ points }: { points: { start: string; kgSaved: number }[] }) {
  const primary = cssVar('--primary');
  const muted = cssVar('--muted-foreground');
  const grid = cssVar('--border');
  // "2026-11-13" -> "13/11" (day/month, the Arabic convention)
  const label = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return (
    <Bar
      data={{
        labels: points.map((p) => label(p.start)),
        datasets: [{ data: points.map((p) => p.kgSaved), backgroundColor: primary, borderRadius: 4, maxBarThickness: 28 }],
      }}
      options={{
        maintainAspectRatio: false,
        plugins: { tooltip: { rtl: true, callbacks: { label: (c) => fmtKg(c.parsed.y ?? 0) } } },
        scales: {
          x: { reverse: true, grid: { display: false }, ticks: { color: muted, maxTicksLimit: 10 } },
          y: { position: 'right', beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
        },
      }}
    />
  );
}

function NeedMap({ areas }: { areas: AreaNeed[] }) {
  const critical = cssVar('--urgency-critical');
  const soon = cssVar('--urgency-soon');
  const normal = cssVar('--urgency-normal');
  const center = areas[0]?.location ?? DAMASCUS;
  return (
    <div className="h-72 overflow-hidden rounded-xl border">
      <MapContainer center={[center.lat, center.lng]} zoom={12} className="size-full" scrollWheelZoom={false}>
        <Tiles />
        {areas.map((a) => {
          const n = a.needIndex ?? 0;
          const color = a.needIndex == null ? cssVar('--claim-closed') : n >= 0.8 ? critical : n >= 0.5 ? soon : normal;
          return (
            <CircleMarker
              key={a.area}
              center={[a.location.lat, a.location.lng]}
              radius={10 + n * 22}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}
            >
              <MapTooltip>
                {a.area}: {a.needIndex == null ? 'غير معروف' : `${Math.round(n * 100)}%`}
              </MapTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
