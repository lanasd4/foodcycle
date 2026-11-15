import type { Allergen, ClaimStatus, StorageCondition } from "@foodcycle/shared";
import { urgencyFor } from "@foodcycle/shared";
import {
  MapPin,
  Sparkles,
  TriangleAlert,
  ShieldCheck,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { cn, formatKg, formatRemaining } from "@/lib/utils";
import { ALLERGEN_LABEL, CLAIM_META, STORAGE_META, URGENCY_META } from "@/lib/labels";

/* =========================================================
   Badges
   ========================================================= */

export function UrgencyBadge({ remainingMinutes }: { remainingMinutes: number }) {
  const level = urgencyFor(remainingMinutes);
  const meta = URGENCY_META[level];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className="num" aria-label={`${meta.label}، متبقٍ ${formatRemaining(remainingMinutes)}`}>
      <Icon />
      {meta.label} · {formatRemaining(remainingMinutes)}
    </Badge>
  );
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const meta = CLAIM_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

export function AllergenChips({ allergens }: { allergens: Allergen[] }) {
  if (allergens.length === 0) {
    return (
      <Badge tone="outline">
        <ShieldCheck />
        بدون مسببات حساسية معلنة
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {allergens.map((a) => (
        <Badge key={a} tone="allergen">
          <TriangleAlert />
          {ALLERGEN_LABEL[a]}
        </Badge>
      ))}
    </div>
  );
}

export function StorageBadge({ condition }: { condition: StorageCondition }) {
  const meta = STORAGE_META[condition];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

/* =========================================================
   Offer card — the most important component in the product
   ========================================================= */

export type OfferCardData = {
  id: string;
  title: string;
  donorName: string;
  category: string;
  quantityKg: number;
  remainingKg: number;
  remainingMinutes: number;
  /** omitted in the donor view (the donor is the pickup point) */
  distanceKm?: number;
  area: string;
  storage: StorageCondition;
  allergens: Allergen[];
  photoUrl?: string | null;
};

/**
 * The main card of the product. `footer` holds the actions of the screen using it
 * (claim, details…); `badge` replaces the urgency badge (e.g. a status for a closed offer);
 * `extra` is shown under the quantity (e.g. a match score).
 */
export function OfferCard({
  offer,
  footer,
  badge,
  extra,
  muted = false,
}: {
  offer: OfferCardData;
  footer?: ReactNode;
  badge?: ReactNode;
  extra?: ReactNode;
  muted?: boolean;
}) {
  const level = urgencyFor(offer.remainingMinutes);
  const pct = Math.round((offer.remainingKg / offer.quantityKg) * 100);
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-pop",
        // urgency stripe on the inline-start edge (right side in RTL)
        "before:absolute before:inset-y-0 before:start-0 before:w-1",
        !muted && level === "CRITICAL" && "before:bg-urgency-critical",
        !muted && level === "SOON" && "before:bg-urgency-soon",
        !muted && level === "NORMAL" && "before:bg-urgency-normal",
        muted && "before:bg-border opacity-80",
      )}
    >
      <div className="flex gap-3.5 p-4">
        <div className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary-soft text-primary-soft-foreground">
          {offer.photoUrl ? (
            <img src={offer.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <Utensils className="size-7" strokeWidth={1.75} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {badge ?? <UrgencyBadge remainingMinutes={offer.remainingMinutes} />}
          <h3 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug">{offer.title}</h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[offer.donorName, offer.category].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 num">
              <MapPin className="size-3.5" />
              {offer.area}
              {offer.distanceKm != null && ` · ${offer.distanceKm.toFixed(1)} كم`}
            </span>
            <StorageBadge condition={offer.storage} />
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">الكمية المتاحة</span>
          <span className="num font-semibold">
            {formatKg(offer.remainingKg)}
            <span className="font-normal text-muted-foreground"> / {formatKg(offer.quantityKg)}</span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3">
          <AllergenChips allergens={offer.allergens} />
        </div>
        {extra && <div className="mt-3">{extra}</div>}
      </div>

      {footer && <div className="flex items-center gap-2 border-t bg-muted/50 px-4 py-3">{footer}</div>}
    </article>
  );
}

/* =========================================================
   Match suggestion — shows score AND the reason (transparency)
   ========================================================= */

export type MatchComponents = { dist: number; type: number; qty: number; time: number; trust: number };

const COMPONENT_LABEL: Record<keyof MatchComponents, string> = {
  dist: "المسافة",
  type: "نوع الطعام",
  qty: "الكمية",
  time: "الوقت",
  trust: "الالتزام",
};

export function MatchSuggestionCard({
  charityName,
  score,
  reasons,
  components,
}: {
  charityName: string;
  score: number;
  reasons: string[];
  components: MatchComponents;
}) {
  const pct = Math.round(score * 100);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div
          className="relative grid size-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--primary) ${pct}%, var(--secondary) 0)` }}
          aria-label={`درجة الملاءمة ${pct}%`}
        >
          <div className="grid size-11 place-items-center rounded-full bg-card text-sm font-bold num">{pct}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-soft-foreground">
            <Sparkles className="size-3.5" />
            اقتراح ذكي
          </div>
          <h4 className="truncate font-semibold">{charityName}</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <Badge key={r} tone="primary">
                {r}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-5 gap-2">
        {(Object.keys(components) as (keyof MatchComponents)[]).map((k) => (
          <div key={k} className="text-center">
            <div className="mx-auto flex h-12 w-2 flex-col justify-end overflow-hidden rounded-full bg-secondary">
              <div className="w-full rounded-full bg-primary" style={{ height: `${components[k] * 100}%` }} />
            </div>
            <dt className="mt-1.5 text-[11px] text-muted-foreground">{COMPONENT_LABEL[k]}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* =========================================================
   Stat tile — Impact Analytics
   ========================================================= */

export function StatTile({
  label,
  value,
  unit,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; positive: boolean };
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-4.5" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight num">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {delta && (
        <p className={cn("mt-1 text-xs font-semibold num", delta.positive ? "text-success" : "text-destructive")}>
          {delta.positive ? "▲" : "▼"} {delta.value} <span className="font-normal text-muted-foreground">مقارنة بالشهر الماضي</span>
        </p>
      )}
    </div>
  );
}
