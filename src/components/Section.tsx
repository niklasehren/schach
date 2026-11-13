import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Abschnitt ohne Kasten: Abstand und eine feine Linie darüber (beim ersten Abschnitt einer Seite keine).
 * Ersetzt die shadcn-Karten auf den Seiten – keine Kästen in Kästen.
 */
export function Section({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('flex flex-col gap-5 border-t pt-8 first:border-t-0 first:pt-0', className)} {...props} />;
}

export function SectionHeader({ className, ...props }: ComponentProps<'header'>) {
  return <header className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function SectionTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-heading text-[28px] leading-tight font-normal', className)} {...props} />;
}

export function SectionDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground', className)} {...props} />;
}

export function SectionContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />;
}

/** Seitenkopf: große Überschrift, optional ruhige Zeile darunter */
export function PageTitle({ children, sub, className }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-col gap-1', className)}>
      <h1 className="font-heading text-[52px] leading-none font-normal md:text-[64px]">{children}</h1>
      {sub && <p className="text-[15px] text-muted-foreground">{sub}</p>}
    </header>
  );
}

/** Feldbeschriftung in normaler Schreibweise (statt kleiner Großbuchstaben) */
export const fieldLabel = 'text-[15px] font-semibold text-foreground';

type Option<T extends string> = { value: T; label: ReactNode; ariaLabel?: string };

/**
 * Ruhige Auswahl (eine Option): Textknöpfe, die gewählte dezent hinterlegt. Messing bleibt den Aktionen vorbehalten.
 * Rolle „group“ mit aria-pressed, damit Screenreader und Tests sie wie bisher finden.
 */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  disabled,
  className,
  itemClassName,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} aria-labelledby={labelledBy} className={cn('flex flex-wrap gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
            o.value === value && 'bg-muted font-semibold text-foreground',
            itemClassName,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
