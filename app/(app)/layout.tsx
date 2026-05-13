import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink-950">
      <Nav />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
