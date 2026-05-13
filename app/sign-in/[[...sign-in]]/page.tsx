import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-ink-950 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-ink-100">
            <span className="text-2xl font-semibold tracking-tight">KAHLA</span>
            <span className="text-emerald-400 text-2xl">·</span>
            <span className="text-ink-300 text-sm uppercase tracking-widest">Buyer Network</span>
          </div>
          <p className="mt-3 text-sm text-ink-400">Operator sign-in</p>
        </div>
        <SignIn routing="path" path="/sign-in" forceRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
