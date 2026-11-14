import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  HandHeart,
  Leaf,
  Moon,
  Plus,
  QrCode,
  Scale,
  Sun,
  Utensils,
  X,
} from "lucide-react";
import { ALLERGENS, type Allergen } from "@foodcycle/shared";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  SectionTitle,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui/primitives";
import {

  AllergenChips,

  ClaimStatusBadge,
  MatchSuggestionCard,
  OfferCard,
  StatTile,
  StorageBadge,
  UrgencyBadge,
  type OfferCardData,
} from "@/components/domain/domain";
import { cn } from "@/lib/utils";
import { ALLERGEN_LABEL, CLAIM_META } from "@/lib/labels";
import type { ClaimStatus } from "@foodcycle/shared";

/* ---------------- theme toggle ---------------- */
function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("fc-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

/* ---------------- sample data ---------------- */
const OFFERS: OfferCardData[] = [
  {
    id: "1",
    title: "أرز بالدجاج وخضار مشكّلة",
    donorName: "مطعم الياسمين",
    category: "مطبوخ",
    quantityKg: 18,
    remainingKg: 11.5,
    remainingMinutes: 42,
    distanceKm: 2.4,
    area: "المزة",
    storage: "HOT",
    allergens: ["dairy"],
  },
  {
    id: "2",
    title: "خبز عربي ومعجنات صباحية",
    donorName: "مخبز السنابل",
    category: "مخبوزات",
    quantityKg: 25,
    remainingKg: 25,
    remainingMinutes: 150,
    distanceKm: 4.1,
    area: "الشعلان",
    storage: "ROOM_TEMP",
    allergens: ["gluten", "sesame", "eggs"],
  },
  {
    id: "3",
    title: "خضار وفواكه طازجة",
    donorName: "سوبرماركت الريف",
    category: "خضار وفواكه",
    quantityKg: 40,
    remainingKg: 12,
    remainingMinutes: 600,
    distanceKm: 6.8,
    area: "كفرسوسة",
    storage: "REFRIGERATED",
    allergens: [],
  },
];

const SCALES: { name: string; prefix: string; steps: (number | string)[] }[] = [
  { name: "Green — الهوية", prefix: "green", steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] },
  { name: "Saffron — الدفء", prefix: "saffron", steps: [50, 100, 200, 300, 400, 500, 600, 700] },
  { name: "Stone — المحايد", prefix: "stone", steps: [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] },
];

const SEMANTIC = [
  ["background", "الخلفية"],
  ["card", "البطاقة"],
  ["primary", "الأساسي"],
  ["primary-soft", "أساسي ناعم"],
  ["accent", "مميّز"],
  ["secondary", "ثانوي"],
  ["muted", "خافت"],
  ["border", "الحدود"],
  ["destructive", "خطر"],
  ["info", "معلومة"],
] as const;

const DOMAIN = [
  ["urgency-critical", "استعجال حرج"],
  ["urgency-soon", "استعجال قريب"],
  ["urgency-normal", "متاح"],
  ["claim-pending", "بانتظار الموافقة"],
  ["claim-reserved", "محجوز"],
  ["claim-picked", "تم الاستلام"],
  ["claim-rejected", "مرفوض"],
  ["claim-closed", "مغلق"],
  ["allergen", "مسبب حساسية"],
  ["cold-chain", "سلسلة تبريد"],
] as const;

const NAV = [
  ["brand", "الهوية"],
  ["colors", "الألوان"],
  ["type", "الخطوط"],
  ["controls", "المكونات"],
  ["status", "الحالات"],
  ["product", "مكونات المنتج"],
] as const;

/* ---------------- page ---------------- */
export default function StyleGuide() {
  const { dark, toggle } = useTheme();
  const [allergens, setAllergens] = useState<Allergen[]>(["gluten"]);
  const [manual, setManual] = useState(false);

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Logo size={34} />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <Badge tone="accent">Design System v1</Badge>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}>
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-5 py-12">
        {/* ================= BRAND ================= */}
        <section id="brand" className="scroll-mt-24">
          <div className="relative overflow-hidden rounded-2xl border bg-card p-8 shadow-card md:p-12">
            <div
              className="pointer-events-none absolute -end-24 -top-24 size-80 rounded-full opacity-60 blur-3xl"
              style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 70%)" }}
            />
            <div className="relative grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
              <div>
                <Badge tone="primary" className="mb-4">
                  <Leaf />
                  نظام التصميم
                </Badge>
                <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                  كل وجبة تستحق
                  <br />
                  <span className="text-primary">فرصة ثانية</span>
                </h1>
                <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
                  المرجع البصري لكل شاشات FoodCycle: الهوية، الألوان، الخطوط، والمكونات. أي واجهة جديدة تُبنى من هذه
                  القطع فقط.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button size="lg">
                    <Plus />
                    نشر عرض
                  </Button>
                  <Button size="lg" variant="outline">
                    تصفح العروض
                  </Button>
                </div>
              </div>
              <div className="flex flex-col items-center gap-6">
                <LogoMark size={148} className="drop-shadow-xl" />
                <Logo size={44} withTagline />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <BrandTile label="على خلفية فاتحة" className="bg-white">
              <img src="/brand/logo-full-light.svg" alt="FoodCycle" className="h-10" />
            </BrandTile>
            <BrandTile label="على خلفية داكنة" className="bg-[#121210]">
              <img src="/brand/logo-full-dark.svg" alt="FoodCycle" className="h-10" />
            </BrandTile>
            <BrandTile label="أيقونة فقط (Plain)" className="bg-primary text-primary-foreground">
              <LogoMark size={56} tone="plain" />
            </BrandTile>
            <BrandTile label="أحجام الأيقونة" className="bg-muted">
              <div className="flex items-end gap-3">
                {[16, 24, 32, 48].map((s) => (
                  <LogoMark key={s} size={s} />
                ))}
              </div>
            </BrandTile>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Principle title="الحلقة" text="سهم دائري: الطعام يعود للدورة بدل أن يُهدر." />
            <Principle title="الورقة" text="ورقة/سنبلة بلون الزعفران: طعام طازج ودفء إنساني." />
            <Principle title="المساحة" text="اترك حول الشعار مسافة لا تقل عن نصف عرض الأيقونة." />
          </div>
        </section>

        {/* ================= COLORS ================= */}
        <section id="colors" className="scroll-mt-24">
          <SectionTitle
            title="الألوان"
            description="ثلاث طبقات: ألوان خام ← معنى في الواجهة ← معنى في المنتج. المكونات تستخدم الطبقتين الأخيرتين فقط."
          />
          <div className="space-y-5">
            {SCALES.map((s) => (
              <div key={s.prefix}>
                <p className="mb-2 text-sm font-semibold">{s.name}</p>
                <div className="grid grid-cols-6 overflow-hidden rounded-xl border sm:grid-cols-12" dir="ltr">
                  {s.steps.map((step) => (
                    <div key={step} className="flex h-20 flex-col justify-end p-2" style={{ background: `var(--${s.prefix}-${step})` }}>
                      <span
                        className="text-[10px] font-semibold num"
                        style={{ color: Number(step) >= 500 || step === 400 && s.prefix === "green" ? "#fff" : "#1c1b19" }}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <TokenList title="Semantic — الواجهة" tokens={SEMANTIC} />
            <TokenList title="Domain — المنتج" tokens={DOMAIN} />
          </div>
        </section>

        {/* ================= TYPE ================= */}
        <section id="type" className="scroll-mt-24">
          <SectionTitle title="الخطوط" description="IBM Plex Sans Arabic لكل النصوص العربية واللاتينية. الأرقام بعرض ثابت (tabular) للكميات والأوقات." />
          <Card>
            <CardContent className="divide-y p-0">
              {[
                ["Display", "text-5xl font-bold tracking-tight", "طعام أقل هدراً"],
                ["H1", "text-3xl font-bold tracking-tight", "لوحة تحليل الأثر"],
                ["H2", "text-xl font-bold", "العروض القريبة منك"],
                ["H3", "text-base font-semibold", "أرز بالدجاج وخضار مشكّلة"],
                ["Body", "text-[15px]", "يمكن للجمعيات طلب جزء من الكمية، وتُحجز فوراً لمدة محددة."],
                ["Small", "text-sm text-muted-foreground", "آخر موعد للاستلام 10:30 مساءً"],
                ["Numbers", "text-2xl font-bold num", "1,284.5 كغ · 00:42"],
              ].map(([name, cls, sample]) => (
                <div key={name} className="flex items-baseline gap-6 px-5 py-4">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground" dir="ltr">
                    {name}
                  </span>
                  <span className={cls}>{sample}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* ================= CONTROLS ================= */}
        <section id="controls" className="scroll-mt-24">
          <SectionTitle title="المكونات الأساسية" description="أزرار ونماذج وتبويبات. ارتفاع اللمس الأدنى 44px على الموبايل." />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>الأزرار</CardTitle>
                <CardDescription>زر أساسي واحد فقط في كل شاشة.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button>أساسي</Button>
                  <Button variant="accent">مميّز</Button>
                  <Button variant="soft">ناعم</Button>
                  <Button variant="secondary">ثانوي</Button>
                  <Button variant="outline">محدد</Button>
                  <Button variant="ghost">شفاف</Button>
                  <Button variant="destructive">رفض</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">صغير</Button>
                  <Button>متوسط</Button>
                  <Button size="lg">كبير</Button>
                  <Button size="icon" variant="outline" aria-label="إشعارات">
                    <Bell />
                  </Button>
                  <Button disabled>معطّل</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>التبويبات</CardTitle>
                <CardDescription>للتنقل بين حالات القوائم.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="active">
                  <TabsList>
                    <TabsTrigger value="active">نشطة</TabsTrigger>
                    <TabsTrigger value="pending">بانتظار موافقتك</TabsTrigger>
                    <TabsTrigger value="done">مكتملة</TabsTrigger>
                  </TabsList>
                  <TabsContent value="active" className="mt-4 text-sm text-muted-foreground">3 عروض منشورة حالياً.</TabsContent>
                  <TabsContent value="pending" className="mt-4 text-sm text-muted-foreground">طلبان بانتظار قرارك.</TabsContent>
                  <TabsContent value="done" className="mt-4 text-sm text-muted-foreground">27 عملية مكتملة هذا الشهر.</TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Publish offer form — food details + approval mode */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>نموذج: نشر عرض</CardTitle>
                <CardDescription>يعرض التفاصيل الغذائية وإعداد الموافقة كما في الخطة التقنية.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <Field label="اسم الطعام" htmlFor="t">
                  <Input id="t" placeholder="مثال: أرز بالدجاج" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="التصنيف" htmlFor="c">
                    <Select id="c" defaultValue="cooked">
                      <option value="cooked">مطبوخ</option>
                      <option value="bakery">مخبوزات</option>
                      <option value="produce">خضار وفواكه</option>
                      <option value="canned">معلبات</option>
                    </Select>
                  </Field>
                  <Field label="الكمية (كغ)" htmlFor="q">
                    <Input id="q" type="number" inputMode="decimal" defaultValue={12} className="num" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="وقت التحضير" htmlFor="p">
                    <Input id="p" type="time" defaultValue="19:30" className="num" />
                  </Field>
                  <Field label="آخر موعد للاستلام" htmlFor="b" hint="يُحسب الحد الآمن تلقائياً">
                    <Input id="b" type="time" defaultValue="22:30" className="num" />
                  </Field>
                </div>
                <Field label="طريقة الحفظ" htmlFor="s">
                  <Select id="s" defaultValue="HOT">
                    <option value="ROOM_TEMP">حرارة الغرفة</option>
                    <option value="HOT">ساخن</option>
                    <option value="REFRIGERATED">مبرّد</option>
                    <option value="FROZEN">مجمّد</option>
                  </Select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="مسببات الحساسية" hint="اختر كل ما ينطبق. إن لم يوجد شيء فأكّد ذلك صراحةً.">
                    <div className="flex flex-wrap gap-2">
                      {ALLERGENS.map((a) => {
                        const on = allergens.includes(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setAllergens((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}
                            className={cn(
                              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                              on
                                ? "border-transparent bg-allergen-soft text-allergen"
                                : "border-input bg-card text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {on && <Check className="size-3.5" />}
                            {ALLERGEN_LABEL[a]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>
                <Field label="المكونات والوصف" htmlFor="d">
                  <Textarea id="d" placeholder="أرز بسمتي، دجاج، بازلاء، جزر، زبدة…" />
                </Field>
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">موافقة يدوية على الطلبات</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {manual
                          ? "ستصلك الطلبات للموافقة خلال 15 دقيقة، وإلا تُلغى تلقائياً."
                          : "تُقبل الطلبات تلقائياً ويُحجز الطعام فوراً."}
                      </p>
                    </div>
                    <Switch checked={manual} onCheckedChange={setManual} aria-label="موافقة يدوية" />
                  </div>
                  <Badge tone={manual ? "pending" : "primary"} className="self-start">
                    الوضع الحالي: {manual ? "يدوي" : "تلقائي"}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button variant="ghost">حفظ كمسودة</Button>
                <Button>
                  <Plus />
                  نشر العرض
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* ================= STATUS ================= */}
        <section id="status" className="scroll-mt-24">
          <SectionTitle title="الحالات والشارات" description="كل حالة لها لون وأيقونة ونص. لا نعتمد على اللون وحده أبداً." />
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>أولوية الصلاحية</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <UrgencyBadge remainingMinutes={35} />
                <UrgencyBadge remainingMinutes={140} />
                <UrgencyBadge remainingMinutes={420} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>طريقة الحفظ</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <StorageBadge condition="ROOM_TEMP" />
                <StorageBadge condition="HOT" />
                <StorageBadge condition="REFRIGERATED" />
                <StorageBadge condition="FROZEN" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>حالة الحجز</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(Object.keys(CLAIM_META) as ClaimStatus[]).map((s) => (
                  <ClaimStatusBadge key={s} status={s} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>مسببات الحساسية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <AllergenChips allergens={["gluten", "dairy", "nuts"]} />
                <AllergenChips allergens={[]} />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ================= PRODUCT ================= */}
        <section id="product" className="scroll-mt-24">
          <SectionTitle title="مكونات المنتج" description="القطع الجاهزة التي تُبنى منها الشاشات الفعلية." />

          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">بطاقة العرض — مرتبة حسب أولوية الصلاحية</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {OFFERS.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">اقتراح المطابقة الذكية</h3>
              <MatchSuggestionCard
                charityName="جمعية بسمة الخير"
                score={0.86}
                reasons={["قريبة 1.8 كم", "تطلب المطبوخ", "كمية مناسبة"]}
                components={{ dist: 0.88, type: 1, qty: 0.74, time: 0.81, trust: 0.92 }}
              />
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">طلب وارد (وضع الموافقة اليدوية)</h3>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-claim-pending-soft text-claim-pending">
                      <HandHeart className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold">جمعية نور الأمل</p>
                        <ClaimStatusBadge status="PENDING_APPROVAL" />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground num">تطلب 8 كغ من «أرز بالدجاج»</p>
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground num">
                        <span className="inline-block size-2 animate-pulse rounded-full bg-claim-pending" />
                        تُلغى تلقائياً خلال 12:40 دقيقة
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button size="sm">
                      <Check />
                      موافقة
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive">
                      <X />
                      رفض
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">تأكيد الاستلام بـ QR</h3>
              <Card className="text-center">
                <CardContent className="p-6">
                  <div className="mx-auto grid size-40 place-items-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft">
                    <QrCode className="size-24 text-primary" strokeWidth={1.25} />
                  </div>
                  <p className="mt-4 font-semibold">اعرض الرمز على المطعم</p>
                  <p className="mt-1 text-sm text-muted-foreground num">الحجز صالح حتى 10:15 م</p>
                  <ClaimStatusBadge status="RESERVED" />
                </CardContent>
              </Card>
            </div>
          </div>

          <h3 className="mb-3 mt-10 text-sm font-semibold text-muted-foreground">لوحة الأثر</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="طعام تم إنقاذه" value="12,480" unit="كغ" icon={Scale} delta={{ value: "18%", positive: true }} />
            <StatTile label="تبرعات ناجحة" value="1,036" icon={Check} delta={{ value: "9%", positive: true }} />
            <StatTile label="جهات مانحة نشطة" value="84" icon={Utensils} delta={{ value: "2%", positive: false }} />
            <StatTile label="جمعيات مستفيدة" value="37" icon={Building2} />
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 text-sm text-muted-foreground">
          <Logo size={26} />
          <span>FoodCycle Design System · v1</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- small helpers ---------------- */
function BrandTile({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className={cn("grid h-32 place-items-center", className)}>{children}</div>
      <div className="border-t bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function Principle({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function TokenList({ title, tokens }: { title: string; tokens: readonly (readonly [string, string])[] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="divide-y rounded-xl border bg-card">
        {tokens.map(([name, label]) => (
          <div key={name} className="flex items-center gap-3 px-4 py-2.5">
            <span className="size-7 shrink-0 rounded-md border" style={{ background: `var(--${name})` }} />
            <span className="text-sm">{label}</span>
            <code className="ms-auto text-xs text-muted-foreground" dir="ltr">
              --{name}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
