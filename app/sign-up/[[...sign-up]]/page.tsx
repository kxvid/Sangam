import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-ink-950 p-6">
      <div className="w-full max-w-md">
        <SignUp routing="path" path="/sign-up" forceRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
