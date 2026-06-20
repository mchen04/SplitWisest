"use client";

import { useState } from "react";
import { api, fmtMoney, todayStr, useFormState, amountInputToCents } from "@/lib/client";
import { Button, ErrorNote, Field, Modal, Select } from "./ui";
import { SettleFields } from "./settle-fields";

export interface DirectSettleFriend {
  id: number;
  displayName: string;
  netByCurrency: Record<string, number>;
}

export function DirectSettleModal({
  friend,
  onClose,
  onSaved,
  existing,
}: {
  friend: DirectSettleFriend | null;
  onClose: () => void;
  onSaved: () => void;
  existing?: { id: number; amountCents: number; currency: string; date: string; note: string; updatedAt: string } | null;
}) {
  if (!friend) return null;
  return <DirectSettleForm key={`${friend.id}:${existing?.id ?? "new"}`} friend={friend} onClose={onClose} onSaved={onSaved} existing={existing} />;
}

function DirectSettleForm({
  friend,
  onClose,
  onSaved,
  existing,
}: {
  friend: DirectSettleFriend;
  onClose: () => void;
  onSaved: () => void;
  existing?: { id: number; amountCents: number; currency: string; date: string; note: string; updatedAt: string } | null;
}) {
  const [initialCurrency, initialAmount] = Object.entries(friend.netByCurrency)[0] ?? ["USD", 0];
  const [direction, setDirection] = useState<"i-paid" | "they-paid">(initialAmount < 0 ? "i-paid" : "they-paid");
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2) : initialAmount !== 0 ? (Math.abs(initialAmount) / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(existing?.currency ?? initialCurrency);
  const [date, setDate] = useState(existing ? String(existing.date).slice(0, 10) : todayStr());
  const [note, setNote] = useState(existing?.note ?? "");
  const { error, setError, busy, run } = useFormState();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = amountInputToCents(amount) ?? 0;
    if (amountCents <= 0) return setError("Enter a positive amount");
    run(async () => {
      if (existing) {
        await api(`/api/settlements/${existing.id}`, {
          method: "PATCH",
          body: { amountCents, currency, date, note, expectedUpdatedAt: existing.updatedAt },
        });
      } else {
        await api("/api/settlements", {
          body: { friendId: friend.id, direction, amountCents, currency, date, note },
        });
      }
      onSaved();
      onClose();
    }, existing ? "Could not update settlement" : "Could not record settlement");
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit payment with ${friend.displayName}` : `Settle with ${friend.displayName}`}>
      <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-xs text-ink-soft">
        Records an offline payment between just the two of you. SplitWisest never moves money.
      </p>
      <form onSubmit={submit} className="space-y-4">
        {!existing && (
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="i-paid">I paid {friend.displayName}</option>
              <option value="they-paid">{friend.displayName} paid me</option>
            </Select>
          </Field>
        )}
        <SettleFields
          amount={amount}
          setAmount={setAmount}
          currency={currency}
          setCurrency={setCurrency}
          date={date}
          setDate={setDate}
          note={note}
          setNote={setNote}
          notePlaceholder="Paid offline"
        />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>
            {existing ? "Save changes" : amount ? `Record ${fmtMoney(amountInputToCents(amount) ?? 0, currency)}` : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
