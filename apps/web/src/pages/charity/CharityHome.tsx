import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Filter, PackageSearch, Sparkles } from 'lucide-react';
import { ALLERGENS, type Allergen } from '@foodcycle/shared';
import { OfferCard } from '@/components/domain/domain';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/feedback';
import { Badge, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { ALLERGEN_LABEL } from '@/lib/labels';
import { toCardData } from '@/lib/offer-card';
import type { Category, CharityNeeds, Offer, Page, Recommendation } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function CharityHome() {
  const needs = useQuery({ queryKey: ['needs'], queryFn: () => api.get<CharityNeeds | null>('/charity-needs/me') });

  return (
    <>
      <PageHeader title="العروض المتاحة" subtitle="مرتّبة حسب الأنسب لكم، والأكثر استعجالاً." />
      {needs.isSuccess && !needs.data && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft p-4">
          <ClipboardList className="size-5 text-accent-soft-foreground" />
          <p className="flex-1 text-sm text-accent-soft-foreground">
            حدّدوا احتياجاتكم (الأصناف، السعة اليومية، ساعات الاستلام) لتصلكم العروض الأنسب فقط.
          </p>
          <Button asChild size="sm" variant="accent">
            <Link to="/charity/needs">تحديد الاحتياجات</Link>
          </Button>
        </div>
      )}
      <Tabs defaultValue="recommended">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="recommended" className="flex-1">
            <Sparkles className="size-4" />
            مقترح لكم
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            <Filter className="size-4" />
            كل العروض
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recommended" className="mt-5">
          <Recommended />
        </TabsContent>
        <TabsContent value="all" className="mt-5">
          <Browse />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Recommended() {
  const q = useQuery({
    queryKey: ['recommended'],
    queryFn: () => api.get<{ items: Recommendation[] }>('/offers/recommended'),
    refetchInterval: 60_000,
  });
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.items.length === 0)
    return (
      <EmptyState
        icon={PackageSearch}
        title="لا عروض مناسبة الآن"
        text="سيصلكم إشعار فور نشر عرض يناسب احتياجاتكم. يمكنكم أيضاً تصفح كل العروض."
      />
    );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {q.data.items.map(({ offer, match }) => (
        <OfferLink key={offer.id} offer={offer}>
          <OfferCard
            offer={toCardData(offer)}
            extra={
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="accent" className="num">
                  <Sparkles />
                  ملاءمة {Math.round(match.score * 100)}%
                </Badge>
                {match.reasons.slice(0, 3).map((r) => (
                  <Badge key={r} tone="primary">
                    {r}
                  </Badge>
                ))}
              </div>
            }
          />
        </OfferLink>
      ))}
    </div>
  );
}

function Browse() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/food-categories') });
  const [category, setCategory] = useState('');
  const [maxKm, setMaxKm] = useState('');
  const [exclude, setExclude] = useState<Allergen[]>([]);

  const q = useQuery({
    queryKey: ['offers', category, maxKm, exclude.join(',')],
    queryFn: () =>
      api.get<Page<Offer>>('/offers', {
        category,
        maxKm,
        excludeAllergens: exclude.join(','),
        limit: 50,
      }),
    refetchInterval: 60_000,
  });

  return (
    <>
      <div className="mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_2fr]">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="التصنيف">
          <option value="">كل التصنيفات</option>
          {categories.data?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={maxKm} onChange={(e) => setMaxKm(e.target.value)} aria-label="المسافة">
          <option value="">أي مسافة</option>
          <option value="2">حتى 2 كم</option>
          <option value="5">حتى 5 كم</option>
          <option value="10">حتى 10 كم</option>
        </Select>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs text-muted-foreground">بدون:</span>
          {ALLERGENS.slice(0, 6).map((a) => {
            const on = exclude.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => setExclude((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}
                className={cn(
                  'h-8 cursor-pointer rounded-full border px-3 text-xs font-medium',
                  on ? 'border-transparent bg-allergen-soft text-allergen' : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                {ALLERGEN_LABEL[a]}
              </button>
            );
          })}
        </div>
      </div>
      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={PackageSearch} title="لا عروض تطابق البحث" text="جرّبوا توسيع المسافة أو إزالة بعض الفلاتر." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground num">{q.data.total} عرض، الأكثر استعجالاً أولاً</p>
          <div className="grid gap-4 md:grid-cols-2">
            {q.data.items.map((o) => (
              <OfferLink key={o.id} offer={o}>
                <OfferCard offer={toCardData(o)} />
              </OfferLink>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function OfferLink({ offer, children }: { offer: Offer; children: React.ReactNode }) {
  return (
    <Link to={`/charity/offers/${offer.id}`} className="block rounded-xl">
      {children}
    </Link>
  );
}
