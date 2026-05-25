import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Toaster } from '@/components/ui/toaster';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/Auth/LoginPage';
import { InactivePage } from '@/pages/Auth/InactivePage';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { ResourcesPage } from '@/pages/Resources/ResourcesPage';
import { ProjectsPage } from '@/pages/Projects/ProjectsPage';
import { AllocationsPage } from '@/pages/Allocations/AllocationsPage';
import { PipelinePage } from '@/pages/Pipeline/PipelinePage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { Skeleton } from '@/components/ui/skeleton';

function Loader() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-6 w-48" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, initialized } = useAuthStore();
  if (!initialized || loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.active) return <Navigate to="/inactive" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/inactive" element={<InactivePage />} />
        <Route
          path="/"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="allocations" element={<AllocationsPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="settings/*" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
