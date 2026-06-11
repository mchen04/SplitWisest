"use client";

import { useEffect, useMemo, useState } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { api, ApiClientError, fmtMoney, todayStr, CURRENCIES } from "@/lib/client";
import { Button, Field, Input, Select, Textarea, Modal, ErrorNote } from "./ui";

export interface Member {
  id: number;
  displayName: string;
}

interface Category {
  id: number;
  name: string;
  custom: boolean;
}

interface ExistingExpense {
  id: number;
  title: string;
  amountCents: number;
  currency: string;
  date: string;
  payerId: number;
  categoryId: number | null;
  notes: string;
  splitMethod: string;
  shares: { userId: number; shareCents: number; rawInput: number | null }[];
  items: { name: string; amountCents: number; participantIds: number[] }[];
  attachments: { id: number; filename: string; mime: string }[];
}

type Method = "equal" | "exact" | "percentage" | "shares" | "itemized";

const METHOD_LABELS: Record<Method, string> = {
  equal: "Equal",
  exact: "Exact amounts",
  percentage: "Percentages",
  shares: "Shares",
  itemized: "Itemized bill",
};

interface ItemRow {
  name: string;
  amount: string;
  participantIds: number[];
}

export function ExpenseForm({
  groupId,
  members,
  meId,
  existing,
  open,
  onClose,
  onSaved,
}: {
  groupId: number;
  members: Member[];
  meId: number;
  existing?: ExistingExpense | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(todayStr());
  const [payerId, setPayerId] = useState(meId);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<Method>("equal");
  const [selected, setSelected] = useState<Set<number>>(new Set(members.map((m) => m.id)));
  const [values, setValues] = useState<Record<number, string>>({});
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ categories: Category[] }>("/api/categories").then((r) => setCategories(r.categories)).catch(() => {});
    setError(null);
    setBusy(false);
    setFiles([]);
    if (existing) {
      setTitle(existing.title);
      setAmount((existing.amountCents / 100).toFixed(2));
      setCurrency(existing.currency);
      setDate(String(existing.date).slice(0, 10));
      setPayerId(existing.payerId);
      setCategoryId(existing.categoryId ?? "");
      setNotes(existing.notes);
      setMethod(existing.splitMethod as Method);
      setSelected(new Set(existing.shares.map((s) => s.userId)));
      const vals: Record<number, string> = {};
      for (const s of existing.shares) {
        if (existing.splitMethod === "exact") vals[s.userId] = (s.shareCents / 100).toFixed(2);
        else if (s.rawInput !== null) vals[s.userId] = String(s.rawInput);
      }
      setValues(vals);
      setItems(
        existing.items.map((i) => ({
          name: i.name,
          amount: (i.amountCents / 100).toFixed(2),
          participantIds: i.participantIds,
        }))
      );
    } else {
      setTitle("");
      setAmount("");
      setDate(todayStr());
      setPayerId(meId);
      setCategoryId("");
      setNotes("");
      setMethod("equal");
      setSelected(new Set(members.map((m) => m.id)));
      setValues({});
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const amountCents = useMemo(() => {
    const n = Math.round(parseFloat(amount || "0") * 100);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  const participantList = members.filter((m) => selected.has(m.id));

  // Live validation feedback for split inputs
  const splitStatus = useMemo(() => {
    if (method === "equal" || amountCents === 0) return null;
    if (method === "exact") {
      const sum = participantList.reduce((s, m) => s + Math.round(parseFloat(values[m.id] || "0") * 100), 0);
      const diff = amountCents - sum;
      return diff === 0
        ? { ok: true, msg: "Amounts match the total" }
        : { ok: false, msg: `${fmtMoney(Math.abs(diff), currency)} ${diff > 0 ? "left to assign" : "over the total"}` };
    }
    if (method === "percentage") {
      const sum = participantList.reduce((s, m) => s + (parseFloat(values[m.id] || "0") || 0), 0);
      return Math.abs(sum - 100) < 0.001
        ? { ok: true, msg: "Adds up to 100%" }
        : { ok: false, msg: `Currently ${sum.toFixed(1)}% — must equal 100%` };
    }
    if (method === "shares") {
      const sum = participantList.reduce((s, m) => s + (parseFloat(values[m.id] || "0") || 0), 0);
      return sum > 0 ? { ok: true, msg: `${sum} total shares` } : { ok: false, msg: "Add at least one share" };
    }
    if (method === "itemized") {
      const sum = items.reduce((s, i) => s + Math.round(parseFloat(i.amount || "0") * 100), 0);
      const diff = amountCents - sum;
      return diff === 0
        ? { ok: true, msg: "Items match the total" }
        : { ok: false, msg: `Items ${diff > 0 ? "under" : "over"} by ${fmtMoney(Math.abs(diff), currency)}` };
    }
    return null;
  }, [method, amountCents, participantList, values, items, currency]);

  function toggleMember(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      const c = await api<Category>("/api/categories", { body: { name: newCategory.trim() } });
      setCategories((cs) => [...cs, c]);
      setCategoryId(c.id);
      setNewCategory("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add category");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amountCents <= 0) return setError("Enter a positive amount");
    if (method !== "itemized" && participantList.length === 0) return setError("Pick at least one participant");

    const participants =
      method === "itemized"
        ? [...new Set(items.flatMap((i) => i.participantIds))].map((userId) => ({ userId }))
        : participantList.map((m) => ({
            userId: m.id,
            value:
              method === "equal"
                ? undefined
                : method === "exact"
                  ? Math.round(parseFloat(values[m.id] || "0") * 100)
                  : parseFloat(values[m.id] || "0") || 0,
          }));
    if (participants.length === 0) return setError("Each item needs participants");

    const body = {
      title: title.trim(),
      amountCents,
      currency,
      date,
      payerId,
      categoryId: categoryId === "" ? null : categoryId,
      notes,
      splitMethod: method,
      participants,
      items:
        method === "itemized"
          ? items.map((i) => ({
              name: i.name.trim() || "Item",
              amountCents: Math.round(parseFloat(i.amount || "0") * 100),
              participantIds: i.participantIds,
            }))
          : undefined,
    };

    setBusy(true);
    try {
      let expenseId: number;
      if (existing) {
        await api(`/api/expenses/${existing.id}`, { method: "PATCH", body });
        expenseId = existing.id;
      } else {
        const r = await api<{ id: number }>(`/api/groups/${groupId}/expenses`, { body });
        expenseId = r.id;
      }
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        await api(`/api/expenses/${expenseId}/attachments`, { form });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save expense");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit expense" : "Add expense"} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Dinner at Nopa" />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Amount">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Paid by">
            <Select value={payerId} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Category">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.custom ? " (custom)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New custom category" hint="Optional — adds to your list">
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Ski trip" />
              <Button type="button" variant="secondary" onClick={addCategory} disabled={!newCategory.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        </div>

        <Field label="Split method">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Split method">
            {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  method === m
                    ? "border-accent bg-accent-soft text-accent-dark"
                    : "border-line text-ink-soft hover:border-ink-faint"
                }`}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </Field>

        {method !== "itemized" ? (
          <fieldset>
            <legend className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Participants
            </legend>
            <div className="divide-y divide-line rounded-lg border border-line">
              {members.map((m) => {
                const checked = selected.has(m.id);
                return (
                  <div key={m.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                    <input
                      id={`p-${m.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(m.id)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <label htmlFor={`p-${m.id}`} className="flex-1 truncate text-sm font-medium">
                      {m.displayName}
                    </label>
                    {checked && method === "equal" && amountCents > 0 && (
                      <span className="tnum text-sm text-ink-faint">
                        ≈ {fmtMoney(Math.floor(amountCents / Math.max(participantList.length, 1)), currency)}
                      </span>
                    )}
                    {checked && method !== "equal" && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="decimal"
                          value={values[m.id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
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
        ) : (
          <fieldset>
            <legend className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Items — pick who shared each one
            </legend>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-line p-3">
                  <div className="flex gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                      placeholder="Pad thai"
                      aria-label={`Item ${idx + 1} name`}
                    />
                    <Input
                      inputMode="decimal"
                      value={item.amount}
                      onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
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
                            setItems((arr) =>
                              arr.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      participantIds: on
                                        ? x.participantIds.filter((p) => p !== m.id)
                                        : [...x.participantIds, m.id],
                                    }
                                  : x
                              )
                            )
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
            </div>
          </fieldset>
        )}

        {splitStatus && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${splitStatus.ok ? "bg-owed-soft text-owed" : "bg-owe-soft text-owe"}`}
            role="status"
          >
            {splitStatus.msg}
          </p>
        )}

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>

        <Field label="Receipts" hint="Images or PDF, up to 4 MB each">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:border-ink-faint">
              <Paperclip className="h-4 w-4" /> Attach file
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFiles((fs) => [...fs, f]);
                  e.target.value = "";
                }}
              />
            </label>
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent-dark">
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            {existing?.attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/attachments/${a.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs text-ink-soft underline"
              >
                {a.filename}
              </a>
            ))}
          </div>
        </Field>

        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pb-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={splitStatus ? !splitStatus.ok : false}>
            {existing ? "Save changes" : "Add expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
