import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { TodoListClient } from '@/components/todos/TodoListClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function TodosPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <section className="min-h-screen bg-[#0E0F11] text-[#F0EDE8] p-8">
        <h1 className="text-2xl font-semibold text-[#F0EDE8]">Household Todo List</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Plan and track shared tasks so everyone stays aligned.
        </p>

        <div className="mt-6 max-w-5xl">
          <TodoListClient householdId={household.id} currentMemberId={member.id} />
        </div>
      </section>
    </AppShell>
  );
}
