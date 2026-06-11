"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError, todayStr, CURRENCIES, fmtMoney } from "@/lib/client";
import { Button, Field, Input, Select, Modal, ErrorNote } from "./ui";
import { Member } from "./expense-form";

// Records an offline payment — purely a ledger entry, no money moves here.
export function SettleModal({
  open,
  onClose,
  onSaved,
  groupId,
  members,
  meId,
  defaultCurrency,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  groupId: number;
  members: Member[];
  meId: number;
  defaultCurrency: string;
  prefill?: { payerId: number; recipientId: number; amountCents: number } | null;
}) {
  const [payerId, setPayerId] = useState(meId);
  const [recipientId, setRecipientId] = useState(0);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setDate(todayStr());
    setNote("");
    setCurrency(defaultCurrency);
    if (prefill) {
      setPayerId(prefill.payerId);
      setRecipientId(prefill.recipientId);
      setAmount((prefill.amountCents / 100).toFixed(2));
    } else {
      setPayerId(meId);
      setRecipientId(members.find((m) => m.id !== meId)?.id ?? 0);
      setAmount("");
    }
    // Only reset when the modal opens — background sync refreshes replace the
    // members array reference and must not wipe in-progress input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    if (payerId === recipientId) return setError("Payer and recipient must be different");
    setBusy(true);
    try {
      await api(`/api/groups/${groupId}/settlements`, {
        body: { payerId, recipientId, amountCents, currency, date, note },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record settlement");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a settlement">
      <p className="mb-4 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
        This records a payment that already happened offline (cash, bank transfer, etc.). SplitWisest never moves
        money.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid">
            <Select value={payerId} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who received">
            <Select value={recipientId} onChange={(e) => setRecipientId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Amount">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Paid in cash" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Record {amount && fmtMoney(Math.round(parseFloat(amount || "0") * 100) || 0, currency)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
