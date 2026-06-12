"use client";

import { ReactNode, useEffect, useRef, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { X, Loader2, Inbox } from "lucide-react";

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-on-accent hover:bg-accent-dark shadow-sm",
    secondary: "bg-card border border-line text-ink hover:border-ink-faint",
    ghost: "text-ink-soft hover:bg-accent-soft hover:text-ink",
    danger: "bg-danger-soft text-danger hover:bg-danger hover:text-on-danger",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[42px] ${styles} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft min-h-[42px]";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-card shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line px-4 py-2.5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
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
    // Move focus into the dialog and trap Tab inside it.
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
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className={`rise-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-pop sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-soft hover:bg-accent-soft hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const cls = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  // design uses hsl(h 34% 42%) for deterministic avatar colors
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls}`}
      style={{ background: `hsl(${hue} 34% 42%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function Money({ cents, currency, signed = false }: { cents: number; currency: string; signed?: boolean }) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(cents) / 100);
  const color = !signed ? "" : cents > 0 ? "text-owed" : cents < 0 ? "text-owe" : "text-ink-faint";
  return (
    <span className={`tnum ${color}`}>
      {signed && cents > 0 ? "+" : signed && cents < 0 ? "−" : ""}
      {fmt}
    </span>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="text-ink-faint">{icon ?? <Inbox className="h-8 w-8" />}</span>
      <p className="font-medium text-ink-soft">{title}</p>
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
