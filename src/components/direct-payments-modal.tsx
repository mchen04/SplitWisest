"use client";

import { useState } from "react";
import { HandCoins, Pencil, Trash2 } from "lucide-react";
import { api, ApiClientError, fmtMoney, fmtDate, useApiData } from "@/lib/client";
import { Modal, Button } from "./ui";
import { DirectSettleModal } from "./direct-settle-modal";

interface DirectSettlement {
  id: number;
  groupId: number | null;
  groupName: string | null;
  payerId: number;
  recipientId: number;
  payerName: string;
  recipientName: string;
  amountCents: number;
  currency: string;
  date: string;
  note: string;
  updatedAt: string;
}

// History of offline payments between you and one friend, with edit and delete.
export function DirectPaymentsModal({
  friend,
  meId,
  onClose,
  onChanged,
}: {
  friend: { id: number; displayName: string } | null;
  meId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<DirectSettlement | null>(null);
  const [errorState, setErrorState] = useState<{ friendId: number; message: string } | null>(null);
  const { data, error: loadError, reload } = useApiData<{ settlements: DirectSettlement[] }>(
    `/api/settlements?friendId=${friend?.id ?? 0}`, 0, { sync: false, enabled: friend !== null }
  );
  const list = data?.settlements ?? (loadError ? [] : null);

  if (!friend) return null;
  const selectedFriend = friend;
  const error = errorState?.friendId === selectedFriend.id ? errorState.message : null;

  async function remove(s: DirectSettlement) {
    if (!window.confirm(`Delete this recorded payment (${fmtMoney(s.amountCents, s.currency)})? Balances will update.`)) return;
    const friendId = selectedFriend.id;
    setErrorState(null);
    try {
      await api(`/api/settlements/${s.id}?expectedUpdatedAt=${encodeURIComponent(s.updatedAt)}`, { method: "DELETE" });
      reload();
      onChanged();
    } catch (err) {
      setErrorState({
        friendId,
        message: err instanceof ApiClientError ? err.message : "Could not delete the payment",
      });
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={`Payments with ${friend.displayName}`}>
        <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-xs text-ink-soft">
          Offline payments recorded between the two of you.
        </p>
        {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {list === null ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">
            No direct payments yet. Use “Settle” to record one.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <HandCoins className="h-4 w-4 shrink-0 text-owed" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block">
                    <strong>{s.payerId === meId ? "You" : s.payerName}</strong> paid{" "}
                    <strong>{s.recipientId === meId ? "you" : s.recipientName}</strong>
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {s.groupName ? `${s.groupName} · ` : "Direct · "}{fmtDate(s.date)}{s.note ? ` · ${s.note}` : ""}
                  </span>
                </span>
                <span className="tnum font-semibold">{fmtMoney(s.amountCents, s.currency)}</span>
                <button
                  onClick={() => setEditing(s)}
                  aria-label="Edit payment"
                  className="rounded-lg p-2 text-ink-faint hover:bg-accent-soft hover:text-accent-dark"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(s)}
                  aria-label="Delete payment"
                  className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </Modal>

      <DirectSettleModal
        friend={editing ? { id: friend.id, displayName: friend.displayName, obligations: [], netByCurrency: {} } : null}
        onClose={() => setEditing(null)}
        onSaved={() => { reload(); onChanged(); }}
        existing={editing}
      />
    </>
  );
}
