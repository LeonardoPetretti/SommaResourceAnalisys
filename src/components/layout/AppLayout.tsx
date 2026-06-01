import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarClock,
  Sparkles,
  Settings as SettingsIcon,
  Moon,
  Sun,
  LogOut,
  Menu,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SommaLogo } from '@/components/brand/SommaLogo';
import { logoutUser } from '@/services/authService';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resources', label: 'Recursos', icon: Users },
  { to: '/projects', label: 'Projetos', icon: Briefcase },
  { to: '/allocations', label: 'Alocações', icon: CalendarClock },
  { to: '/pipeline', label: 'Pipeline', icon: Sparkles, adminOnly: true },
  { to: '/settings', label: 'Configurações', icon: SettingsIcon, adminOnly: true },
];

export function AppLayout() {
  const { user, isAdmin } = useAuthStore();
  const { theme, toggleTheme, sidebarOpen, setSidebarOpen } = useUIStore();
  const nav = useNavigate();

  const handleLogout = async () => {
    await logoutUser();
    nav('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-all duration-200',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          {sidebarOpen ? (
            <SommaLogo size="md" />
          ) : (
            <SommaLogo variant="compact" size="md" />
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV.filter((item) => !item.adminOnly || isAdmin()).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {sidebarOpen && <span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span>}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-card px-4">
          <div>
            <h1 className="text-lg font-semibold">
              Gestão de Recursos &amp; Alocações
              <span className="ml-2 hidden align-middle text-xs font-normal text-muted-foreground sm:inline">
                · by <span className="somma-text-accent font-semibold">SOMMA IT</span>
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Delivery · Quality · Professionalism
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="hidden text-right md:block">
                  <p className="text-sm font-medium">{user.name}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <Badge variant={isAdmin() ? 'default' : 'secondary'} className="text-[10px]">
                      {user.role}
                    </Badge>
                  </div>
                </div>
                <Avatar>
                  {user.photoURL && <AvatarImage src={user.photoURL} alt={user.name} />}
                  <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
