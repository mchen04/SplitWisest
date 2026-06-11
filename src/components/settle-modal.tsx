"use client";

import { useEffect, useState } from "react";
import { api, todayStr, fmtMoney, useFormState } from "@/lib/client";
import { Button, Field, Select, Modal, ErrorNote } from "./ui";
import { SettleFields } from "./settle-fields";
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
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  groupId: number;
  members: Member[];
  meId: number;
  defaultCurrency: string;
  prefill?: { payerId: number; recipientId: number; amountCents: number } | null;
  existing?: { id: number; payerId: number; recipientId: number; amountCents: number; currency: string; date: string; note: string } | null;
}) {
  const [payerId, setPayerId] = useState(meId);
  const [recipientId, setRecipientId] = useState(0);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const { error, setError, busy, run } = useFormState();

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (existing) {
      setPayerId(existing.payerId);
      setRecipientId(existing.recipientId);
      setAmount((existing.amountCents / 100).toFixed(2));
      setCurrency(existing.currency);
      setDate(String(existing.date).slice(0, 10));
      setNote(existing.note);
    } else {
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
    }
    // Only reset when the modal opens — background sync refreshes replace the
    // members array reference and must not wipe in-progress input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    if (payerId === recipientId) return setError("Payer and recipient must be different");
    run(async () => {
      if (existing) {
        await api(`/api/settlements/${existing.id}`, {
          method: "PATCH",
          body: { amountCents, currency, date, note },
        });
      } else {
        await api(`/api/groups/${groupId}/settlements`, {
          body: { payerId, recipientId, amountCents, currency, date, note },
        });
      }
      onSaved();
      onClose();
    }, existing ? "Could not update settlement" : "Could not record settlement");
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit recorded payment" : "Record a settlement"}>
      <p className="mb-4 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
        This records a payment that already happened offline (cash, bank transfer, etc.). SplitWisest never moves
        money.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid">
            <Select value={payerId} disabled={!!existing} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who received">
            <Select value={recipientId} disabled={!!existing} onChange={(e) => setRecipientId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SettleFields
          amount={amount} setAmount={setAmount}
          currency={currency} setCurrency={setCurrency}
          date={date} setDate={setDate}
          note={note} setNote={setNote}
          notePlaceholder="Paid in cash"
        />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {existing ? "Save changes" : `Record ${amount ? fmtMoney(Math.round(parseFloat(amount || "0") * 100) || 0, currency) : ""}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
