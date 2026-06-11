"use client";

import { useEffect, useState } from "react";
import { api, useFormState } from "@/lib/client";
import { Button, Field, Input, Select, Modal, ErrorNote } from "./ui";
import { Member } from "./expense-form";

export function RecurringModal({
  open, onClose, onSaved, groupId, members, meId, defaultCurrency,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  groupId: number; members: Member[]; meId: number; defaultCurrency: string;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState(meId);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("monthly");
  const [startDate, setStartDate] = useState("");
  const { error, setError, busy, run } = useFormState();

  useEffect(() => {
    if (!open) return;
    setTitle(""); setAmount(""); setPayerId(meId); setCadence("monthly");
    const d = new Date(); d.setDate(d.getDate() + 1);
    setStartDate(d.toISOString().slice(0, 10));
    setError(null);
  }, [open, meId, setError]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    run(async () => {
      await api(`/api/groups/${groupId}/recurring`, {
        body: {
          title: title.trim(), amountCents, currency: defaultCurrency, payerId,
          participantIds: members.map((m) => m.id), cadence, startDate, notes: "",
        },
      });
      onSaved(); onClose();
    }, "Could not create recurring expense");
  }

  return (
    <Modal open={open} onClose={onClose} title="Add recurring expense">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Rent" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${defaultCurrency})`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
          </Field>
          <Field label="Paid by">
            <Select value={payerId} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </Select>
          </Field>
          <Field label="Repeats">
            <Select value={cadence} onChange={(e) => setCadence(e.target.value as "weekly" | "monthly")}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
          <Field label="First date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
        </div>
        <p className="rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
          Splits equally among all current group members each time it runs.
        </p>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
