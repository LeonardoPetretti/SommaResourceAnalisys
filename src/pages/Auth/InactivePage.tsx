import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { logoutUser } from '@/services/authService';
import { SommaLogo } from '@/components/brand/SommaLogo';

export function InactivePage() {
  const nav = useNavigate();
  const handleLogout = async () => {
    await logoutUser();
    nav('/login', { replace: true });
  };

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden somma-login-bg p-6">
      <Card className="relative z-10 w-full max-w-md border-border/40 bg-card/80 text-center backdrop-blur-sm somma-glow">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <SommaLogo size="lg" />
          </div>
          <CardTitle>Acesso pendente</CardTitle>
          <CardDescription>
            Sua conta foi criada mas ainda não foi ativada por um administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleLogout}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
