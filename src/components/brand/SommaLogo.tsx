import { cn } from '@/lib/utils';

interface Props {
  /** "full" mostra "SOMMA IT", "compact" mostra só "S". */
  variant?: 'full' | 'compact';
  /** Tamanho do texto. Padrão: 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Mostrar a tagline abaixo (apenas em variant=full) */
  showTagline?: boolean;
}

const SIZE_MAP: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl',
  xl: 'text-5xl',
};

/**
 * Logo wordmark da SOMMA IT.
 *
 * O original brinca com tipografia: as letras "O" e "M" do meio são
 * substituídas visualmente por "0" e "1" em verde, formando "S01MMA".
 * Reproduzimos a mesma ideia: SOMMA → S + 0 (verde) + 1 (verde) + MMA + IT.
 */
export function SommaLogo({
  variant = 'full',
  size = 'md',
  className,
  showTagline,
}: Props) {
  const textSize = SIZE_MAP[size];

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-baseline font-black tracking-tight leading-none',
          textSize,
          className
        )}
        aria-label="SOMMA IT"
      >
        <span className="text-foreground">S</span>
        <span className="text-primary">0</span>
      </div>
    );
  }

  return (
    <div
      className={cn('inline-flex flex-col leading-none', className)}
      aria-label="SOMMA IT"
    >
      <div className={cn('flex items-baseline font-black tracking-tight', textSize)}>
        <span className="text-foreground">S</span>
        <span className="text-primary">0</span>
        <span className="text-primary">1</span>
        <span className="text-foreground">MMA</span>
        <span className="ml-1.5 text-foreground text-[0.5em] font-bold tracking-widest">
          IT
        </span>
      </div>
      {showTagline && (
        <span className="mt-1.5 text-[0.55em] tracking-[0.2em] text-muted-foreground uppercase">
          Delivery · Quality · Professionalism
        </span>
      )}
    </div>
  );
}

/**
 * "Sigil" reduzido — pode ser usado em favicons in-app, badges, etc.
 * É um quadrado verde com a inicial.
 */
export function SommaSigil({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md bg-primary font-black text-primary-foreground',
        className
      )}
      aria-label="SOMMA"
    >
      S
    </div>
  );
}
