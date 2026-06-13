"use client";

import {
  ReactNode, useEffect, useRef, useState,
  ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";
import { X, Loader2, Inbox, ChevronDown, MoreHorizontal } from "lucide-react";

/* ── Buttons ───────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-dark",
  secondary: "bg-card border border-line text-ink hover:bg-subtle hover:border-line-strong",
  ghost: "text-ink-soft hover:bg-subtle hover:text-ink",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-on-danger",
};

export function Button({
  variant = "primary",
  busy = false,
  size = "md",
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  busy?: boolean;
  size?: "md" | "sm";
}) {
  const sizing = size === "sm"
    ? "min-h-[var(--control-h-sm)] px-2.5 text-xs gap-1"
    : "min-h-[var(--control-h)] px-3.5 text-sm gap-1.5";
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[10px] py-1.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft disabled:opacity-50 disabled:pointer-events-none ${sizing} ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only action. Always labeled (aria + tooltip) with a comfortable hit area. */
export function IconButton({
  label,
  variant = "ghost",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "ghost" | "danger";
}) {
  const styles = variant === "danger"
    ? "text-ink-faint hover:bg-danger-soft hover:text-danger"
    : "text-ink-soft hover:bg-subtle hover:text-ink";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Overflow menu ─────────────────────────────────────────────────────── */

/** Lightweight popover menu for secondary / overflow actions. Closes on
 *  outside-click and Escape. Pass a custom trigger or get a default ⋯ button. */
export function Menu({
  label = "More actions",
  trigger,
  children,
  align = "end",
}: {
  label?: string;
  trigger?: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>
        {trigger ?? (
          <IconButton label={label} aria-haspopup="menu" aria-expanded={open}>
            <MoreHorizontal className="h-4.5 w-4.5" />
          </IconButton>
        )}
      </div>
      {open && (
        <div
          role="menu"
          className={`fade-in absolute z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-pop ${align === "end" ? "right-0" : "left-0"}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  danger = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-subtle"} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
}

/* ── Form controls ─────────────────────────────────────────────────────── */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/** A true section divider label — the only place uppercase is allowed. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-wider text-ink-faint ${className}`}>{children}</p>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-line-strong bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft min-h-[var(--control-h)]";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/** Native select, but with the raw OS arrow replaced by a consistent chevron. */
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block w-full">
      <select
        {...props}
        className={`${inputCls} cursor-pointer appearance-none pr-9 ${className}`}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
    </span>
  );
}

/* ── Containers ────────────────────────────────────────────────────────── */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-card shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4 py-2">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/** Small inline tag — group names, categories, quiet metadata. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "bg-subtle text-ink-soft",
    accent: "bg-accent-soft text-accent-dark",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones} ${className}`}>
      {children}
    </span>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? [];
    const first = focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const els = [...focusables()];
        if (els.length === 0) return;
        const idx = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (idx <= 0 || idx === -1)) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && idx === els.length - 1) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className={`rise-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-pop sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ── Identity & money ──────────────────────────────────────────────────── */

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const cls = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" }[size];
  // Deterministic per-name hue — the one sanctioned hard-coded color in the app.
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls}`}
      style={{ background: `hsl(${hue} 52% 45%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function Money({
  cents,
  currency,
  signed = false,
  className = "",
}: {
  cents: number;
  currency: string;
  signed?: boolean;
  className?: string;
}) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(cents) / 100);
  const color = !signed ? "" : cents > 0 ? "text-owed" : cents < 0 ? "text-owe" : "text-ink-faint";
  return (
    <span className={`tnum ${color} ${className}`}>
      {signed && cents > 0 ? "+" : signed && cents < 0 ? "−" : ""}
      {fmt}
    </span>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="text-ink-faint">{icon ?? <Inbox className="h-7 w-7" />}</span>
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-faint">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
