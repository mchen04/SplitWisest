"use client";

import { useState } from "react";
import { api, fmtMoney, todayStr, useFormState } from "@/lib/client";
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
}: {
  friend: DirectSettleFriend | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!friend) return null;
  return <DirectSettleForm key={friend.id} friend={friend} onClose={onClose} onSaved={onSaved} />;
}

function DirectSettleForm({
  friend,
  onClose,
  onSaved,
}: {
  friend: DirectSettleFriend;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [initialCurrency, initialAmount] = Object.entries(friend.netByCurrency)[0] ?? ["USD", 0];
  const [direction, setDirection] = useState<"i-paid" | "they-paid">(initialAmount < 0 ? "i-paid" : "they-paid");
  const [amount, setAmount] = useState(initialAmount !== 0 ? (Math.abs(initialAmount) / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(initialCurrency);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const { error, setError, busy, run } = useFormState();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    run(async () => {
      await api("/api/settlements", {
        body: { friendId: friend.id, direction, amountCents, currency, date, note },
      });
      onSaved();
      onClose();
    }, "Could not record settlement");
  }

  return (
    <Modal open onClose={onClose} title={`Settle with ${friend.displayName}`}>
      <p className="mb-4 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
        Records an offline payment between just the two of you. SplitWisest never moves money.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
            <option value="i-paid">I paid {friend.displayName}</option>
            <option value="they-paid">{friend.displayName} paid me</option>
          </Select>
        </Field>
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
            {amount ? `Record ${fmtMoney(Math.round(parseFloat(amount || "0") * 100) || 0, currency)}` : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
