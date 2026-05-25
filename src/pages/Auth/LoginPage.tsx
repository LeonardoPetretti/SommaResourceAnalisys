import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { loginWithGoogle } from '@/services/authService';
import { toast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';
import { SommaLogo } from '@/components/brand/SommaLogo';

export function LoginPage() {
  const { user, initialized } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (initialized && user?.active) nav('/dashboard', { replace: true });
  }, [initialized, user, nav]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Skeleton className="h-64 w-96" />
      </div>
    );
  }
  if (user?.active) return <Navigate to="/dashboard" replace />;

  const handleLogin = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      toast({
        title: 'Falha no login',
        description: e?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden somma-login-bg p-6">
      <SommaWaves />

      <Card className="relative z-10 w-full max-w-md border-border/40 bg-card/80 backdrop-blur-sm somma-glow">
        <CardContent className="space-y-8 p-8">
          <div className="flex flex-col items-center text-center">
            <SommaLogo size="xl" showTagline />
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Resource Allocation
            </h2>
            <p className="text-sm text-muted-foreground">
              Plataforma de Gestão de Recursos &amp; Projetos
            </p>
          </div>

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            <Chrome className="h-5 w-5" />
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Apenas usuários autorizados pelo administrador podem acessar.
          </p>
        </CardContent>
      </Card>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] tracking-[0.3em] text-muted-foreground/60 uppercase">
        © {new Date().getFullYear()} SOMMA IT
      </p>
    </div>
  );
}

/** Linhas suaves verdes evocando o background do logo SOMMA. */
function SommaWaves() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-40"
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="somma-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--somma-green))" stopOpacity="0" />
          <stop offset="50%" stopColor="hsl(var(--somma-green))" stopOpacity="0.8" />
          <stop offset="100%" stopColor="hsl(var(--somma-green))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 18 }).map((_, i) => {
        const y = 80 + i * 45;
        const amp = 90 + (i % 4) * 18;
        const offset = (i % 3) * 20;
        return (
          <path
            key={i}
            d={`M -50 ${y} Q ${360 + offset} ${y - amp}, ${720} ${y} T ${1490} ${y}`}
            stroke="url(#somma-line)"
            strokeWidth="1"
            fill="none"
            opacity={0.3 + (i % 5) * 0.1}
          />
        );
      })}
    </svg>
  );
}
