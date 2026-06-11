"use client";

import { useEffect, useState } from "react";
import { LogOut, Trash2, UserMinus } from "lucide-react";
import { api, ApiClientError, useFormState } from "@/lib/client";
import { Button, Field, Input, Modal, ErrorNote, Avatar } from "./ui";
import { Member } from "./expense-form";

// Group admin surface: rename, manage members (remove / leave), and delete.
export function GroupSettingsModal({
  open,
  onClose,
  group,
  members,
  meId,
  onChanged,
  onGone,
}: {
  open: boolean;
  onClose: () => void;
  group: { id: number; name: string; createdBy: number };
  members: (Member & { username: string })[];
  meId: number;
  onChanged: () => void;
  onGone: () => void;
}) {
  const [name, setName] = useState(group.name);
  const { error, setError, busy, run } = useFormState();
  const [actionError, setActionError] = useState<string | null>(null);
  const isCreator = group.createdBy === meId;

  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setError(null);
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group.id]);

  function rename(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await api(`/api/groups/${group.id}`, { method: "PATCH", body: { name: name.trim() } });
      onChanged();
    }, "Could not rename the group");
  }

  async function removeMember(userId: number, displayName: string) {
    const self = userId === meId;
    const msg = self
      ? "Leave this group? You can rejoin later with the invite code."
      : `Remove ${displayName} from this group?`;
    if (!window.confirm(msg)) return;
    setActionError(null);
    try {
      await api(`/api/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      if (self) onGone();
      else onChanged();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : "Could not remove that member");
    }
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete "${group.name}"? This permanently removes all its expenses, settlements, and chat for everyone. This can't be undone.`)) return;
    setActionError(null);
    try {
      await api(`/api/groups/${group.id}`, { method: "DELETE" });
      onGone();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : "Could not delete the group");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Group settings">
      <div className="space-y-5">
        <form onSubmit={rename} className="space-y-3">
          <Field label="Group name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end">
            <Button type="submit" busy={busy} disabled={!name.trim() || name.trim() === group.name}>
              Save name
            </Button>
          </div>
        </form>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Members</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {members.map((m) => {
              const self = m.id === meId;
              const memberIsCreator = m.id === group.createdBy;
              const canRemove = self ? !isCreator : isCreator;
              return (
                <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Avatar name={m.displayName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.displayName}
                      {self && <span className="text-ink-faint"> (you)</span>}
                      {memberIsCreator && <span className="text-ink-faint"> · creator</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">@{m.username}</span>
                  </span>
                  {canRemove && (
                    <button
                      onClick={() => removeMember(m.id, m.displayName)}
                      aria-label={self ? "Leave group" : `Remove ${m.displayName}`}
                      title={self ? "Leave group" : `Remove ${m.displayName}`}
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      {self ? <LogOut className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-ink-faint">
            Members must be settled up (net zero) before they can be removed or leave.
          </p>
        </div>

        <ErrorNote message={actionError} />

        <div className="border-t border-line pt-4">
          {isCreator ? (
            <Button variant="danger" className="w-full" onClick={deleteGroup}>
              <Trash2 className="h-4 w-4" /> Delete group
            </Button>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => removeMember(meId, "you")}>
              <LogOut className="h-4 w-4" /> Leave group
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
