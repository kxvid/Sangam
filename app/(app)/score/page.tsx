import { ScoreForm } from "@/components/score-form";

export default function ScorePage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Score a deal</h1>
        <p className="mt-1 text-sm text-ink-400">
          Type the address and asking price. We pull comps, compute ARV, apply the 70% rule, and
          give you a 0-100 score plus kill reasons.
        </p>
      </header>
      <ScoreForm />
    </div>
  );
}
