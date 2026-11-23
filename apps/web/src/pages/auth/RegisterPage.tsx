import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Building2, Check, HandHeart, Utensils } from 'lucide-react';
import { CHARITY_ORG_TYPES, CITIES, CITY_INFO, DONOR_ORG_TYPES, type City, type OrgType } from '@foodcycle/shared';
import { LocationPicker } from '@/components/map/Map';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field, Input, PasswordInput } from '@/components/ui/primitives';
import { homeFor, useAuth } from '@/lib/auth';
import { ORG_TYPE_LABEL } from '@/lib/format';
import type { LatLng } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AuthLayout } from './AuthLayout';

type RoleChoice = 'DONOR' | 'CHARITY';
const STEPS = ['نوع الجهة', 'بيانات الجهة', 'الموقع', 'الحساب'];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<RoleChoice>('DONOR');
  const [type, setType] = useState<OrgType>('RESTAURANT');
  const [city, setCity] = useState<City>('DAMASCUS');
  const [org, setOrg] = useState({ name: '', phone: '', area: '', address: '', registrationNumber: '' });
  const [location, setLocation] = useState<LatLng | null>(null);
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const types = role === 'DONOR' ? DONOR_ORG_TYPES : CHARITY_ORG_TYPES;
  const set = (k: keyof typeof org) => (e: React.ChangeEvent<HTMLInputElement>) => setOrg({ ...org, [k]: e.target.value });
  const areas = CITY_INFO[city].areas;
  // a known neighbourhood: the map opens on it
  const areaFocus = areas.find((a) => a.name === org.area.trim())?.location ?? null;

  function chooseCity(c: City) {
    if (c === city) return;
    setCity(c);
    setLocation(null); // a point in the other city is no longer valid
    if (CITY_INFO[city].areas.some((a) => a.name === org.area.trim())) setOrg({ ...org, area: '' });
  }

  const stepValid = [
    true,
    org.name.trim().length >= 2 && /^\+?[0-9 ()-]{7,20}$/.test(org.phone.trim()) && org.area.trim().length >= 2 && org.address.trim().length >= 5,
    location !== null,
    /\S+@\S+\.\S+/.test(account.email) && account.password.length >= 10 && account.password === account.confirm,
  ][step];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const s = await register({
        email: account.email,
        password: account.password,
        role,
        organization: {
          name: org.name,
          type,
          phone: org.phone,
          address: org.address,
          city,
          area: org.area,
          location,
          ...(org.registrationNumber ? { registrationNumber: org.registrationNumber } : {}),
        },
      });
      navigate(homeFor(s.user, s.organization), { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight">انضم إلى FoodCycle</h1>
      <p className="mt-2 text-muted-foreground">يراجع فريقنا كل جهة قبل تفعيلها، عادةً خلال يوم عمل.</p>

      {/* steps */}
      <ol className="mt-7 flex items-center gap-2" aria-label="خطوات التسجيل">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-secondary')} />
            <span className={cn('text-[11px]', i === step ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-4">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['DONOR', 'جهة مانحة', 'مطعم، فندق، مخبز، متجر', Utensils],
                  ['CHARITY', 'جهة مستفيدة', 'جمعية خيرية أو مؤسسة إنسانية', HandHeart],
                ] as const
              ).map(([value, title, sub, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRole(value);
                    setType(value === 'DONOR' ? 'RESTAURANT' : 'CHARITY');
                  }}
                  aria-pressed={role === value}
                  className={cn(
                    'relative cursor-pointer rounded-xl border-2 p-4 text-start transition-colors',
                    role === value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted',
                  )}
                >
                  {role === value && <Check className="absolute end-3 top-3 size-4 text-primary" />}
                  <Icon className="size-6 text-primary" />
                  <p className="mt-3 font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                </button>
              ))}
            </div>
            <Field label="النوع">
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={type === t}
                    className={cn(
                      'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium',
                      type === t ? 'border-transparent bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted',
                    )}
                  >
                    {ORG_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="المدينة">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="المدينة">
                {CITIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={city === c}
                    onClick={() => chooseCity(c)}
                    className={cn(
                      'h-11 cursor-pointer rounded-lg border text-sm font-semibold transition-colors',
                      city === c ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-input bg-card hover:bg-muted',
                    )}
                  >
                    {CITY_INFO[c].label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="اسم الجهة" htmlFor="name">
              <Input id="name" value={org.name} onChange={set('name')} placeholder={role === 'DONOR' ? 'مطعم الياسمين' : 'جمعية بسمة الخير'} />
            </Field>
            <Field label="رقم الهاتف" htmlFor="phone">
              <Input id="phone" dir="ltr" inputMode="tel" value={org.phone} onChange={set('phone')} placeholder="+963 11 123 4567" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المنطقة" htmlFor="area">
                <Input id="area" list="areas" value={org.area} onChange={set('area')} placeholder={areas[0].name} autoComplete="off" />
                <datalist id="areas">
                  {areas.map((a) => (
                    <option key={a.name} value={a.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="رقم الترخيص" htmlFor="reg" hint="اختياري، يسرّع التحقق">
                <Input id="reg" value={org.registrationNumber} onChange={set('registrationNumber')} />
              </Field>
            </div>
            <Field label="العنوان التفصيلي" htmlFor="address">
              <Input id="address" value={org.address} onChange={set('address')} placeholder="الشارع، البناء، أقرب معلم" />
            </Field>
          </>
        )}

        {step === 2 && (
          <Field
            label={`${role === 'DONOR' ? 'موقع استلام الطعام' : 'موقع الجمعية'} في ${CITY_INFO[city].label}`}
            hint="يُستخدم لحساب المسافة واقتراح الأنسب."
          >
            <LocationPicker value={location} onChange={setLocation} city={city} focus={areaFocus} />
          </Field>
        )}

        {step === 3 && (
          <>
            <Field label="البريد الإلكتروني" htmlFor="email">
              <Input id="email" type="email" dir="ltr" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
            </Field>
            <Field label="كلمة المرور" htmlFor="pw" hint="10 أحرف على الأقل">
              <PasswordInput id="pw" dir="ltr" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
            </Field>
            <Field
              label="تأكيد كلمة المرور"
              htmlFor="pw2"
              error={account.confirm && account.confirm !== account.password ? 'كلمتا المرور غير متطابقتين' : undefined}
            >
              <PasswordInput id="pw2" dir="ltr" autoComplete="new-password" value={account.confirm} onChange={(e) => setAccount({ ...account, confirm: e.target.value })} />
            </Field>
            <FormError error={error} />
          </>
        )}
      </div>

      <div className="mt-7 flex gap-3">
        {step > 0 && (
          <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>
            <ArrowRight className="rtl:rotate-0 ltr:rotate-180" />
            السابق
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="flex-1" disabled={!stepValid} onClick={() => setStep(step + 1)}>
            التالي
            <ArrowLeft className="ltr:rotate-180" />
          </Button>
        ) : (
          <Button size="lg" className="flex-1" disabled={!stepValid || busy} onClick={submit}>
            <Building2 />
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
          </Button>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        لديك حساب؟{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </AuthLayout>
  );
}
