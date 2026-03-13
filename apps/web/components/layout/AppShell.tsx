import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 flex flex-col min-h-screen bg-[#F5F2EC]">
        {children}
      </main>
    </div>
  );
}
