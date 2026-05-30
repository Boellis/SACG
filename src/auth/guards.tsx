import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';
import PendingApproval from './PendingApproval';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-garden-50">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-garden-600 border-t-transparent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function RequireAuth() {
  const { user, status, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/signin" replace />;
  if (status === 'pending') return <PendingApproval />;

  return <Outlet />;
}

export function RequireAdmin({ children }: { children?: React.ReactNode }) {
  const { role, loading } = useAuth();

  if (loading) return <Spinner />;

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-garden-50 px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Not authorized</h2>
          <p className="text-gray-500">This page is only accessible to administrators.</p>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
