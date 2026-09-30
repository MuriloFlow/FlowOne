import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  APPLICATION_STATUS_META,
  JOB_STATUS_META,
  type RhApplicationStatus,
  type RhJobStatus,
} from "@/lib/rh/types";

const ease = [0.22, 1, 0.36, 1] as const;

// ============================================================
// Primitivos do PORTAL DO RH — mesmos padrões do launcher
// (Input/Label/Select/Dialog de @/components/ui, cores e raios idênticos).
// ============================================================

export function RhField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[12px] text-[#F0EFEC]/45">
        {label}
        {required ? <span className="ml-0.5 text-red-400/70">*</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.22, ease }}
            className="flex items-center gap-1 overflow-hidden pt-1 text-[11.5px] font-medium text-red-300/90"
          >
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <p key="hint" className="pt-1 text-[11px] text-[#F0EFEC]/28">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const inputBase =
  "h-9 w-full rounded-[10px] border bg-white/[0.03] px-3 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/28 transition-colors focus:outline-none";

const inputOk = "border-white/[0.08] focus:border-white/16";

const inputError =
  "border-red-400/45 focus:border-red-400/70 bg-red-400/[0.04]";

export function RhInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  disabled,
  maxLength,
  error,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  disabled?: boolean;
  maxLength?: number;
  error?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      inputMode={inputMode}
      disabled={disabled}
      maxLength={maxLength}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`${inputBase} ${error ? inputError : inputOk} ${disabled ? "opacity-40" : ""}`}
    />
  );
}

export function RhTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`${inputBase} ${inputOk} h-auto resize-y py-2 leading-relaxed ${disabled ? "opacity-40" : ""}`}
    />
  );
}

/** Checkbox no padrão do launcher (nunca o checkbox nativo do navegador). */
export function RhCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2.5 text-left disabled:opacity-40"
    >
      <span
        className={`flex size-[16px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 ${
          checked
            ? "border-[#F0EFEC] bg-[#F0EFEC] text-[#111111]"
            : "border-white/[0.16] bg-transparent group-hover:border-white/30"
        }`}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="text-[12.5px] text-[#F0EFEC]/65 transition group-hover:text-[#F0EFEC]/85">
        {label}
      </span>
    </button>
  );
}

/** Input de data/hora no mesmo padrão do RhInput. */
export function RhDateTimeInput({
  value,
  onChange,
  type = "date",
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "time";
  error?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputBase} ${error ? inputError : inputOk} [color-scheme:dark]`}
    />
  );
}

/** Select idêntico ao do launcher (@/components/ui/select) para uso nas telas do RH. */
export function RhSelect({
  value,
  options,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      options={options}
      placeholder={placeholder}
      onChange={onChange}
      className={className}
    />
  );
}

// ============================================================
// Header / estados
// ============================================================

export function RhPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] text-[#F0EFEC]/88">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function RhCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cnA(
        "rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function RhSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cnA("animate-pulse rounded-[16px] bg-white/4", className)}
    />
  );
}

export function RhEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[16px] border border-dashed border-white/[0.07] bg-[#1A1A1A]/60 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-[#F0EFEC]/70">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[12.5px] text-[#F0EFEC]/38">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function RhErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-red-500/15 bg-red-500/8 px-6 py-8 text-center">
      <p className="text-[13.5px] text-red-200/85">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-[8px] border border-white/10 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-[#F0EFEC] transition hover:bg-white/10"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

// ============================================================
// Botões (mesmo padrão dos modais do launcher)
// ============================================================

export function RhPrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cnA(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] font-medium text-[#111111] transition hover:bg-white disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function RhGhostButton({
  children,
  onClick,
  disabled,
  className,
  title,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cnA(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition disabled:opacity-40",
        tone === "danger"
          ? "border-red-400/20 bg-red-400/8 text-red-200/85 hover:bg-red-400/15"
          : "border-white/[0.08] bg-white/[0.03] text-[#F0EFEC]/70 hover:bg-white/[0.06]",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ============================================================
// Chips de status (mesma linguagem de cores do resto do app)
// ============================================================

const TONE_CLASS: Record<string, string> = {
  green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90",
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-200/90",
  gray: "border-white/10 bg-white/[0.05] text-[#F0EFEC]/60",
  blue: "border-sky-300/20 bg-sky-300/10 text-sky-200/90",
};

export function RhJobStatusChip({ status }: { status: RhJobStatus }) {
  const meta = JOB_STATUS_META[status];
  return (
    <span
      className={cnA(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        TONE_CLASS[meta.tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function RhApplicationStatusChip({
  status,
}: {
  status: RhApplicationStatus;
}) {
  const meta = APPLICATION_STATUS_META[status];
  return (
    <span
      className={cnA(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        meta.chip,
      )}
    >
      <span className={cnA("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

// ============================================================
// Lista reordenável (setas ↑ ↓ + remover) — padrão launcher
// ============================================================

export function RhOrderedList<T extends { id: string }>({
  items,
  onMove,
  onRemove,
  render,
}: {
  items: T[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove?: (item: T, index: number) => void;
  render: (item: T, index: number) => ReactNode;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function endDrag(): void {
    setDragFrom(null);
    setDragOver(null);
  }

  function drop(index: number): void {
    if (dragFrom !== null && dragFrom !== index) onMove(dragFrom, index);
    endDrag();
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => {
        const dragging = dragFrom === index;
        const dropTarget =
          dragFrom !== null && dragOver === index && dragFrom !== index;
        return (
          <motion.div
            key={item.id}
            layout
            transition={{ duration: 0.22, ease }}
            draggable={dragFrom === null || dragging}
            onDragStart={() => setDragFrom(index)}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(index);
            }}
            className={`flex items-center gap-2 rounded-[10px] border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 transition-shadow ${
              dropTarget
                ? "shadow-[inset_0_2px_0_0_rgba(240,239,236,0.55),inset_0_-1px_0_0_rgba(240,239,236,0.2)]"
                : ""
            } ${dragging ? "opacity-35" : ""}`}
          >
            <span
              aria-label="Arraste para reordenar"
              title="Arraste para reordenar"
              className="flex shrink-0 cursor-grab flex-col gap-[2px] py-1 text-[#F0EFEC]/25 transition active:cursor-grabbing hover:text-[#F0EFEC]/50"
            >
              {[0, 1].map((row) => (
                <span key={row} className="flex gap-[2px]">
                  {[0, 1, 2].map((col) => (
                    <span
                      key={col}
                      className="size-[3px] rounded-full bg-current"
                    />
                  ))}
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1">{render(item, index)}</span>
            <span className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
                className="flex size-5 items-center justify-center rounded-[5px] text-[#F0EFEC]/35 transition hover:bg-white/[0.06] hover:text-[#F0EFEC]/80 disabled:opacity-25"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={index === items.length - 1}
                onClick={() => onMove(index, index + 1)}
                className="flex size-5 items-center justify-center rounded-[5px] text-[#F0EFEC]/35 transition hover:bg-white/[0.06] hover:text-[#F0EFEC]/80 disabled:opacity-25"
              >
                <ArrowDown className="size-3" />
              </button>
            </span>
            {onRemove ? (
              <button
                type="button"
                aria-label="Remover"
                onClick={() => onRemove(item, index)}
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[#F0EFEC]/30 transition hover:bg-red-400/10 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

function cnA(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(" ");
}
