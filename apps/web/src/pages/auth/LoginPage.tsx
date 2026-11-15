import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/primitives';
import { homeFor, useAuth } from '@/lib/auth';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await login(email, password);
      navigate(homeFor(s.user, s.organization), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight">أهلاً بعودتك</h1>
      <p className="mt-2 text-muted-foreground">سجّل الدخول لمتابعة عروضك وطلباتك.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="البريد الإلكتروني" htmlFor="email">
          <Input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="كلمة المرور" htmlFor="password">
          <Input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError error={error} />
        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        جهة جديدة؟{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          أنشئ حساباً
        </Link>
      </p>
    </AuthLayout>
  );
}
