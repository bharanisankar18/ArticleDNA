import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- buttons
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-ink text-cream hover:bg-[#1c2235] active:bg-[#262d44] disabled:bg-ink/35 disabled:text-cream/80 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]',
  secondary:
    'bg-sheet text-ink border border-line-strong hover:border-ink/40 hover:bg-white disabled:text-ink-3 disabled:hover:border-line-strong',
  ghost: 'text-ink-2 hover:bg-cream hover:text-ink disabled:text-ink-3/60 disabled:hover:bg-transparent',
  danger: 'text-bad hover:bg-bad-wash disabled:opacity-50',
};

const SIZE: Record<Size, string> = {
  md: 'h-10 px-4 gap-2 text-body font-semibold rounded-[10px]',
  sm: 'h-8 px-3 gap-1.5 text-small font-semibold rounded-[8px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 select-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export function IconButton({ label, active, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150',
        active ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-cream hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- badge
type Tone = 'neutral' | 'indigo' | 'ok' | 'warn' | 'bad' | 'outline';
const TONE: Record<Tone, string> = {
  neutral: 'bg-cream text-ink-2',
  indigo: 'bg-indigo-wash text-indigo-deep',
  ok: 'bg-ok-wash text-ok',
  warn: 'bg-warn-wash text-warn',
  bad: 'bg-bad-wash text-bad',
  outline: 'border border-line-strong text-ink-2',
};

export function Badge({ tone = 'neutral', children, dot, title }: { tone?: Tone; children: ReactNode; dot?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 text-meta font-semibold whitespace-nowrap', TONE[tone])}
    >
      {dot && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- callout
export function Callout({
  tone = 'neutral',
  icon,
  title,
  children,
  actions,
}: {
  tone?: 'neutral' | 'warn' | 'bad' | 'indigo';
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const tones = {
    neutral: 'bg-sheet border-line text-ink-2',
    warn: 'bg-warn-wash/60 border-warn/25 text-ink-2',
    bad: 'bg-bad-wash/60 border-bad/25 text-ink-2',
    indigo: 'bg-indigo-wash/70 border-indigo/25 text-ink-2',
  } as const;
  const iconTone = { neutral: 'text-ink-2', warn: 'text-warn', bad: 'text-bad', indigo: 'text-indigo-deep' }[tone];
  return (
    <div className={cx('rounded-[12px] border px-3.5 py-3', tones[tone])} role={tone === 'bad' ? 'alert' : undefined}>
      <div className="flex gap-2.5">
        {icon && <span className={cx('mt-[1px] shrink-0', iconTone)}>{icon}</span>}
        <div className="min-w-0 flex-1">
          {title && <p className="text-body font-semibold text-ink">{title}</p>}
          {children && <div className={cx('text-small', title ? 'mt-0.5' : null)}>{children}</div>}
          {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toggle
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">{label}</p>
        {description && <p className="mt-0.5 text-small text-ink-3">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-indigo' : 'bg-cream-deep',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgb(9_13_26/0.3)] transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- misc
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Divider() {
  return <span aria-hidden className="inline-block h-3 w-px bg-line-strong align-middle" />;
}
