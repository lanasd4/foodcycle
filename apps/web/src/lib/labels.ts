import type { Allergen, ClaimStatus, StorageCondition, Urgency } from "@foodcycle/shared";
import {
  AlarmClock,
  CheckCircle2,
  Clock,
  Flame,
  Hourglass,
  Package,
  Snowflake,
  Thermometer,
  XCircle,
  Ban,
  Timer,
  type LucideIcon,
} from "lucide-react";

/* =========================================================
   Labels (Arabic) — one place for every user-facing domain term
   ========================================================= */

export const URGENCY_META: Record<Urgency, { label: string; tone: "critical" | "soon" | "normal"; icon: LucideIcon }> = {
  CRITICAL: { label: "حرج", tone: "critical", icon: AlarmClock },
  SOON: { label: "قريب", tone: "soon", icon: Hourglass },
  NORMAL: { label: "متاح", tone: "normal", icon: Clock },
};

export const CLAIM_META: Record<
  ClaimStatus,
  { label: string; tone: "pending" | "reserved" | "picked" | "rejected" | "closed"; icon: LucideIcon }
> = {
  PENDING_APPROVAL: { label: "بانتظار الموافقة", tone: "pending", icon: Hourglass },
  RESERVED: { label: "محجوز", tone: "reserved", icon: Package },
  PICKED_UP: { label: "تم الاستلام", tone: "picked", icon: CheckCircle2 },
  REJECTED: { label: "مرفوض", tone: "rejected", icon: XCircle },
  APPROVAL_TIMEOUT: { label: "انتهت مهلة الموافقة", tone: "closed", icon: Timer },
  EXPIRED: { label: "لم يُستلم", tone: "closed", icon: Timer },
  CANCELLED_BY_CHARITY: { label: "ألغته الجمعية", tone: "closed", icon: Ban },
  CANCELLED_BY_DONOR: { label: "ألغاه المانح", tone: "closed", icon: Ban },
};

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: "غلوتين",
  dairy: "ألبان",
  eggs: "بيض",
  nuts: "مكسرات",
  peanuts: "فول سوداني",
  soy: "صويا",
  fish: "سمك",
  shellfish: "قشريات",
  sesame: "سمسم",
};

export const STORAGE_META: Record<StorageCondition, { label: string; icon: LucideIcon; tone: "cold" | "accent" | "neutral" }> = {
  ROOM_TEMP: { label: "حرارة الغرفة", icon: Thermometer, tone: "neutral" },
  HOT: { label: "ساخن", icon: Flame, tone: "accent" },
  REFRIGERATED: { label: "مبرّد", icon: Snowflake, tone: "cold" },
  FROZEN: { label: "مجمّد", icon: Snowflake, tone: "cold" },
};

