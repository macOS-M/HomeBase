import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-0 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 flex-1 flex flex-col min-h-screen bg-[#F5F2EC] overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
