"use client";

import { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { fmtMoney } from "@/lib/client";
import { Button, Input } from "./ui";
import { Member } from "./expense-form";

export type Method = "equal" | "exact" | "percentage" | "shares" | "itemized";

export const METHOD_LABELS: Record<Method, string> = {
  equal: "Equal",
  exact: "Exact amounts",
  percentage: "Percentages",
  shares: "Shares",
  itemized: "Itemized bill",
};

export interface ItemRow {
  name: string;
  amount: string;
  participantIds: number[];
}

const LEGEND = "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft";

// Participant picker for equal/exact/percentage/shares: a checkbox per member
// plus, for weighted methods, the per-member value input.
export function ParticipantSplit({
  members, selected, method, values, amountCents, currency, participantCount, onToggle, onValue,
}: {
  members: Member[];
  selected: Set<number>;
  method: Exclude<Method, "itemized">;
  values: Record<number, string>;
  amountCents: number;
  currency: string;
  participantCount: number;
  onToggle: (id: number) => void;
  onValue: (id: number, value: string) => void;
}) {
  return (
    <fieldset>
      <legend className={LEGEND}>Participants</legend>
      <div className="divide-y divide-line rounded-lg border border-line">
        {members.map((m) => {
          const checked = selected.has(m.id);
          return (
            <div key={m.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
              <input
                id={`p-${m.id}`}
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(m.id)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <label htmlFor={`p-${m.id}`} className="flex-1 truncate text-sm font-medium">
                {m.displayName}
              </label>
              {checked && method === "equal" && amountCents > 0 && (
                <span className="tnum text-sm text-ink-faint">
                  ≈ {fmtMoney(Math.floor(amountCents / Math.max(participantCount, 1)), currency)}
                </span>
              )}
              {checked && method !== "equal" && (
                <div className="flex items-center gap-1.5">
                  <Input
                    inputMode="decimal"
                    value={values[m.id] ?? ""}
                    onChange={(e) => onValue(m.id, e.target.value)}
                    className="!w-24 text-right"
                    aria-label={`${METHOD_LABELS[method]} for ${m.displayName}`}
                    placeholder={method === "exact" ? "0.00" : method === "percentage" ? "%" : "1"}
                  />
                  <span className="w-4 text-xs text-ink-faint">
                    {method === "percentage" ? "%" : method === "exact" ? currency.slice(0, 1) : "×"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

// Itemized bill: a row per item with its own amount and per-item participants.
export function ItemizedSplit({
  members,
  items,
  setItems,
  currency,
  subtotalCents,
  taxEnabled,
  taxRate,
  taxCents,
  tipEnabled,
  tipRate,
  tipCents,
  totalCents,
  onTaxEnabled,
  onTaxRate,
  onTipEnabled,
  onTipRate,
}: {
  members: Member[];
  items: ItemRow[];
  setItems: Dispatch<SetStateAction<ItemRow[]>>;
  currency: string;
  subtotalCents: number;
  taxEnabled: boolean;
  taxRate: string;
  taxCents: number;
  tipEnabled: boolean;
  tipRate: string;
  tipCents: number;
  totalCents: number;
  onTaxEnabled: (enabled: boolean) => void;
  onTaxRate: (rate: string) => void;
  onTipEnabled: (enabled: boolean) => void;
  onTipRate: (rate: string) => void;
}) {
  const patch = (idx: number, next: Partial<ItemRow>) =>
    setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, ...next } : x)));

  return (
    <fieldset>
      <legend className={LEGEND}>Items — pick who shared each one</legend>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border border-line p-3">
            <div className="flex gap-2">
              <Input
                value={item.name}
                onChange={(e) => patch(idx, { name: e.target.value })}
                placeholder="Pad thai"
                aria-label={`Item ${idx + 1} name`}
              />
              <Input
                inputMode="decimal"
                value={item.amount}
                onChange={(e) => patch(idx, { amount: e.target.value })}
                className="!w-28 text-right"
                placeholder="0.00"
                aria-label={`Item ${idx + 1} amount`}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                aria-label={`Remove item ${idx + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = item.participantIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch(idx, {
                        participantIds: on
                          ? item.participantIds.filter((p) => p !== m.id)
                          : [...item.participantIds, m.id],
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      on ? "border-accent bg-accent-soft text-accent-dark" : "border-line text-ink-soft"
                    }`}
                  >
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setItems((arr) => [...arr, { name: "", amount: "", participantIds: [] }])}
        >
          <Plus className="h-4 w-4" /> Add item
        </Button>
        <div className="rounded-lg border border-line bg-paper/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={taxEnabled}
                onChange={(e) => onTaxEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Tax
            </label>
            <div className="flex items-center justify-between gap-2">
              <Input
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => onTaxRate(e.target.value)}
                disabled={!taxEnabled}
                className="!w-24 text-right"
                aria-label="Tax rate"
              />
              <span className="text-sm text-ink-faint">% = {fmtMoney(taxCents, currency)}</span>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={tipEnabled}
                onChange={(e) => onTipEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Tip
            </label>
            <div className="flex items-center justify-between gap-2">
              <Input
                inputMode="decimal"
                value={tipRate}
                onChange={(e) => onTipRate(e.target.value)}
                disabled={!tipEnabled}
                className="!w-24 text-right"
                aria-label="Tip rate"
              />
              <span className="text-sm text-ink-faint">% = {fmtMoney(tipCents, currency)}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
            <span className="text-ink-faint">Subtotal</span>
            <span className="text-ink-faint">Adjustments</span>
            <span className="text-right font-semibold">Total</span>
            <span className="tnum">{fmtMoney(subtotalCents, currency)}</span>
            <span className="tnum">{fmtMoney(taxCents + tipCents, currency)}</span>
            <span className="tnum text-right font-semibold">{fmtMoney(totalCents, currency)}</span>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
