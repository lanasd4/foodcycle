import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Role } from '@foodcycle/shared';
import { AppShell } from '@/components/app/AppShell';
import { Spinner } from '@/components/ui/feedback';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { AuthProvider, homeFor, useAuth } from '@/lib/auth';

// Pages are split per area: a charity never downloads the admin charts.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const PendingPage = lazy(() => import('@/pages/auth/PendingPage'));
const DonorHome = lazy(() => import('@/pages/donor/DonorHome'));
const PublishOffer = lazy(() => import('@/pages/donor/PublishOffer'));
const DonorOffer = lazy(() => import('@/pages/donor/DonorOffer'));
const ScanPickup = lazy(() => import('@/pages/donor/ScanPickup'));
const CharityHome = lazy(() => import('@/pages/charity/CharityHome'));
const CharityOffer = lazy(() => import('@/pages/charity/CharityOffer'));
const MyClaims = lazy(() => import('@/pages/charity/MyClaims'));
const ClaimDetail = lazy(() => import('@/pages/charity/ClaimDetail'));
const NeedsPage = lazy(() => import('@/pages/charity/NeedsPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminOrgs = lazy(() => import('@/pages/admin/AdminOrgs'));
const AdminAudit = lazy(() => import('@/pages/admin/AdminAudit'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const StyleGuide = lazy(() => import('@/pages/StyleGuide'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // don't hammer the server for errors that will not fix themselves
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-7" />
    </div>
  );
}

/** Signed in, right role, and (except admins) a verified organization */
function RequireRole({ roles }: { roles: Role[] }) {
  const { status, user, organization } = useAuth();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anonymous' || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user, organization)} replace />;
  if (user.role !== 'ADMIN' && organization?.status !== 'ACTIVE') return <Navigate to="/pending" replace />;
  return <Outlet />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status, user, organization } = useAuth();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <Navigate to={homeFor(user, organization)} replace />;
  return children;
}

function Home() {
  const { status, user, organization } = useAuth();
  if (status === 'loading') return <FullScreenSpinner />;
  return <Navigate to={homeFor(user, organization)} replace />;
}

function Root() {
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <Outlet />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <PublicOnly><LoginPage /></PublicOnly> },
      { path: '/register', element: <PublicOnly><RegisterPage /></PublicOnly> },
      { path: '/pending', element: <PendingPage /> },
      { path: '/style-guide', element: <StyleGuide /> },
      {
        element: <RequireRole roles={['DONOR', 'CHARITY', 'ADMIN']} />,
        children: [{ element: <AppShell />, children: [{ path: '/account', element: <AccountPage /> }] }],
      },
      {
        element: <RequireRole roles={['DONOR']} />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/donor', element: <DonorHome /> },
              { path: '/donor/offers/new', element: <PublishOffer /> },
              { path: '/donor/offers/:id', element: <DonorOffer /> },
              { path: '/donor/scan', element: <ScanPickup /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['CHARITY']} />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/charity', element: <CharityHome /> },
              { path: '/charity/offers/:id', element: <CharityOffer /> },
              { path: '/charity/claims', element: <MyClaims /> },
              { path: '/charity/claims/:id', element: <ClaimDetail /> },
              { path: '/charity/needs', element: <NeedsPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['ADMIN']} />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/admin', element: <AdminDashboard /> },
              { path: '/admin/orgs', element: <AdminOrgs /> },
              { path: '/admin/audit', element: <AdminAudit /> },
              { path: '/admin/settings', element: <AdminSettings /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
