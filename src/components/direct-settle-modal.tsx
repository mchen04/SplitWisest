"use client";

import { useState } from "react";
import { api, fmtMoney, todayStr, useFormState, amountInputToCents, useMe } from "@/lib/client";
import { Button, ErrorNote, Field, Modal, Select } from "./ui";
import { SettleFields } from "./settle-fields";
import type { FriendObligation } from "@/lib/balances";

export interface DirectSettleFriend {
  id: number;
  displayName: string;
  obligations: FriendObligation[];
  netByCurrency: Record<string, number>;
}

function obligationKey(obligation: FriendObligation): string {
  const direction = obligation.netCents < 0 ? "pay" : "receive";
  return `${obligation.groupId ?? "direct"}:${obligation.currency}:${direction}`;
}

export function DirectSettleModal({
  friend,
  onClose,
  onSaved,
  existing,
  preferredSign,
}: {
  friend: DirectSettleFriend | null;
  onClose: () => void;
  onSaved: () => void;
  existing?: { id: number; amountCents: number; currency: string; date: string; note: string; updatedAt: string } | null;
  preferredSign?: -1 | 1;
}) {
  if (!friend) return null;
  return (
    <DirectSettleForm
      key={`${friend.id}:${existing?.id ?? "new"}`}
      friend={friend}
      onClose={onClose}
      onSaved={onSaved}
      existing={existing}
      preferredSign={preferredSign}
    />
  );
}

function DirectSettleForm({
  friend,
  onClose,
  onSaved,
  existing,
  preferredSign,
}: {
  friend: DirectSettleFriend;
  onClose: () => void;
  onSaved: () => void;
  existing?: { id: number; amountCents: number; currency: string; date: string; note: string; updatedAt: string } | null;
  preferredSign?: -1 | 1;
}) {
  const me = useMe();
  const obligations = friend.obligations.filter((item) => item.netCents !== 0);
  const initialIndex = Math.max(
    0,
    obligations.findIndex((item) =>
      preferredSign ? Math.sign(item.netCents) === preferredSign : item.netCents < 0
    )
  );
  const initialObligation = obligations[initialIndex];
  const [selectedKey, setSelectedKey] = useState(
    !existing && initialObligation ? obligationKey(initialObligation) : null
  );
  const obligation = obligations.find((item) => obligationKey(item) === selectedKey);
  const [direction, setDirection] = useState<"i-paid" | "they-paid">("i-paid");
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(existing?.currency ?? initialObligation?.currency ?? "USD");
  const [date, setDate] = useState(existing ? String(existing.date).slice(0, 10) : todayStr());
  const [note, setNote] = useState(existing?.note ?? "");
  const { error, setError, busy, run } = useFormState();
  const shownAmount = obligation ? (Math.abs(obligation.netCents) / 100).toFixed(2) : amount;
  const shownCurrency = obligation?.currency ?? currency;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedKey !== null && !obligation) return setError("This balance changed. Select it again.");
    const amountCents = obligation ? Math.abs(obligation.netCents) : amountInputToCents(amount) ?? 0;
    const paymentCurrency = obligation?.currency ?? currency;
    const paymentDirection = obligation ? (obligation.netCents < 0 ? "i-paid" : "they-paid") : direction;
    if (amountCents <= 0) return setError("Enter a positive amount");
    run(async () => {
      if (existing) {
        await api(`/api/settlements/${existing.id}`, {
          method: "PATCH",
          body: { amountCents, currency: paymentCurrency, date, note, expectedUpdatedAt: existing.updatedAt },
        });
      } else if (obligation?.groupId !== null && obligation?.groupId !== undefined) {
        if (!me) throw new Error("Your account is still loading");
        await api(`/api/groups/${obligation.groupId}/settlements`, {
          body: {
            payerId: paymentDirection === "i-paid" ? me.id : friend.id,
            recipientId: paymentDirection === "i-paid" ? friend.id : me.id,
            amountCents,
            currency: paymentCurrency,
            date,
            note,
            settleFullBalance: true,
          },
        });
      } else {
        await api("/api/settlements", {
          body: {
            friendId: friend.id,
            direction: paymentDirection,
            amountCents,
            currency: paymentCurrency,
            date,
            note,
            settleFullBalance: Boolean(obligation),
          },
        });
      }
      onSaved();
      onClose();
    }, existing ? "Could not update settlement" : "Could not record settlement");
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit payment with ${friend.displayName}` : `Settle with ${friend.displayName}`}>
      <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-xs text-ink-soft">
        Records an offline payment against the selected balance. SplitWisest never moves money.
      </p>
      <form onSubmit={submit} className="space-y-4">
        {!existing && obligations.length > 0 && (
          <Field label="Balance">
            <Select value={selectedKey ?? ""} onChange={(e) => setSelectedKey(e.target.value)}>
              {obligations.map((item) => (
                <option key={obligationKey(item)} value={obligationKey(item)}>
                  {item.groupName ?? "Direct balance"} ·{" "}
                  {item.netCents < 0 ? "You owe" : `${friend.displayName} owes you`}{" "}
                  {fmtMoney(Math.abs(item.netCents), item.currency)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!existing && obligations.length === 0 && (
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="i-paid">I paid {friend.displayName}</option>
              <option value="they-paid">{friend.displayName} paid me</option>
            </Select>
          </Field>
        )}
        <SettleFields
          amount={shownAmount}
          setAmount={setAmount}
          currency={shownCurrency}
          setCurrency={setCurrency}
          date={date}
          setDate={setDate}
          note={note}
          setNote={setNote}
          notePlaceholder="Paid offline"
          lockAmount={Boolean(obligation)}
          lockCurrency={Boolean(obligation)}
        />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>
            {existing
              ? "Save changes"
              : shownAmount
                ? `Record ${fmtMoney(obligation ? Math.abs(obligation.netCents) : amountInputToCents(amount) ?? 0, shownCurrency)}`
                : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
