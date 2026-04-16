'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  useTodoItems,
  useCreateTodoItem,
  useToggleTodoItemDone,
  useDeleteTodoItem,
  useClearDoneTodoItems,
  useMembers,
} from '@homebase/api';
import type { TodoPriority } from '@homebase/types';

type Priority = TodoPriority;

const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-[rgba(107,165,131,0.12)] text-[#6BA583] border-[rgba(107,165,131,0.25)]',
  medium: 'bg-[rgba(232,160,32,0.12)] text-[#E8A020] border-[rgba(232,160,32,0.25)]',
  high: 'bg-[rgba(224,123,106,0.12)] text-[#E07B6A] border-[rgba(224,123,106,0.25)]',
};

function priorityScore(priority: Priority) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

export function TodoListClient({ householdId, currentMemberId }: { householdId: string; currentMemberId: string }) {
  const supabase = createClient();
  const { data: todoItems = [], isLoading, error } = useTodoItems(supabase, householdId);
  const { data: members = [] } = useMembers(supabase, householdId);
  const createItem = useCreateTodoItem(supabase, householdId);
  const toggleItem = useToggleTodoItemDone(supabase, householdId);
  const deleteItem = useDeleteTodoItem(supabase, householdId);
  const clearDoneItems = useClearDoneTodoItems(supabase, householdId);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [actionError, setActionError] = useState('');

  const filteredItems = useMemo(() => {
    const list =
      filter === 'all'
        ? todoItems
        : filter === 'done'
        ? todoItems.filter((item) => item.done)
        : todoItems.filter((item) => !item.done);

    return [...list].sort((a, b) => {
      const doneDelta = Number(a.done) - Number(b.done);
      if (doneDelta !== 0) return doneDelta;
      const prioDelta = priorityScore(a.priority) - priorityScore(b.priority);
      if (prioDelta !== 0) return prioDelta;
      const dueA = a.due_date ?? '9999-12-31';
      const dueB = b.due_date ?? '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [todoItems, filter]);

  const openCount = todoItems.filter((item) => !item.done).length;
  const doneCount = todoItems.length - openCount;

  function memberName(memberId?: string) {
    if (!memberId) return 'Unassigned';
    return members.find((m) => m.id === memberId)?.name ?? 'Unknown member';
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setActionError('');

    try {
      await createItem.mutateAsync({
        title: trimmed,
        notes: notes.trim() || undefined,
        priority,
        due_date: dueDate || undefined,
        assigned_to: assignedTo || undefined,
        created_by: currentMemberId,
      });

      setTitle('');
      setNotes('');
      setPriority('medium');
      setDueDate('');
      setAssignedTo('');
    } catch (err: any) {
      setActionError(err?.message ?? 'Unable to add todo item.');
    }
  }

  function toggleDone(itemId: string, done: boolean) {
    setActionError('');
    toggleItem.mutate(
      { itemId, done: !done },
      { onError: (err: any) => setActionError(err?.message ?? 'Unable to update task.') }
    );
  }

  function removeItem(id: string) {
    setActionError('');
    deleteItem.mutate(id, {
      onError: (err: any) => setActionError(err?.message ?? 'Unable to remove task.'),
    });
  }

  function clearDone() {
    setActionError('');
    clearDoneItems.mutate(undefined, {
      onError: (err: any) => setActionError(err?.message ?? 'Unable to clear completed tasks.'),
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#161719] rounded-2xl border border-[rgba(255,255,255,0.06)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#F0EDE8]">Shared household tasks</h2>
          <div className="text-xs text-[#6B6560]">
            {openCount} open · {doneCount} done
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add task"
            className="md:col-span-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
            required
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1f2022] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          />
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1f2022] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="md:col-span-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          />
          <button
            type="submit"
            disabled={createItem.isPending}
            className="rounded-lg bg-[#C9A84C] text-[#0E0F11] text-sm font-semibold px-3 py-2 hover:bg-[#D4B05A]"
          >
            {createItem.isPending ? 'Adding...' : 'Add task'}
          </button>
        </form>
      </div>

      <div className="bg-[#161719] rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="p-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
          <div className="flex gap-2">
            {(['open', 'done', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`text-xs rounded-full px-3 py-1 border ${
                  filter === value
                    ? 'border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.12)] text-[#C9A84C]'
                    : 'border-[rgba(255,255,255,0.1)] text-[#6B6560]'
                }`}
              >
                {value === 'open' ? 'Open' : value === 'done' ? 'Done' : 'All'}
              </button>
            ))}
          </div>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={clearDone}
              className="text-xs text-[#E07B6A] hover:underline"
            >
              Clear done
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-[#6B6560]">Loading household tasks...</p>
        ) : filteredItems.length === 0 ? (
          <p className="p-6 text-sm text-[#6B6560]">
            {filter === 'open' ? 'No open tasks. Add one above.' : 'No tasks in this filter yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(255,255,255,0.04)]">
            {filteredItems.map((item) => (
              <li key={item.id} className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleDone(item.id, item.done)}
                    className={`mt-0.5 w-5 h-5 rounded border text-xs flex items-center justify-center ${
                      item.done
                        ? 'bg-[rgba(107,165,131,0.2)] border-[rgba(107,165,131,0.4)] text-[#6BA583]'
                        : 'border-[rgba(255,255,255,0.2)] text-transparent hover:text-[#6B6560]'
                    }`}
                    aria-label={item.done ? 'Mark as open' : 'Mark as done'}
                  >
                    ✓
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${item.done ? 'line-through text-[#6B6560]' : 'text-[#F0EDE8]'}`}>
                      {item.title}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B6560]">
                      <span className={`px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[item.priority]}`}>
                        {item.priority}
                      </span>
                      <span>Assigned: {memberName(item.assigned_to)}</span>
                      {item.due_date && <span>Due: {item.due_date}</span>}
                    </div>

                    {item.notes && <p className="mt-2 text-xs text-[#8E8882]">{item.notes}</p>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-[#6B6560] hover:text-[#E07B6A]"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        {(error || actionError) && (
          <p className="px-4 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#E07B6A]">
            {String(error ?? actionError)}
          </p>
        )}
      </div>
    </div>
  );
}
