import { CheckCircle2, ClipboardList } from "lucide-react";
import type { JudgeCategoryCompletion } from "@carshow/carshow-components";

export function JudgeCompletionPanel({ categories }: { categories: JudgeCategoryCompletion[] }) {
  const totalJudges = categories.reduce((total, category) => total + category.judgeCount, 0);
  const completeJudges = categories.reduce((total, category) => total + category.completeJudgeCount, 0);

  return (
    <section className="judge-completion-panel">
      <div className="panel-heading">
        <div>
          <ClipboardList size={22} />
          <strong>Judge Completion</strong>
        </div>
        <span>
          {completeJudges}/{totalJudges} complete ballots
        </span>
      </div>

      <div className="judge-completion-grid">
        {categories.map((category) => (
          <article className="judge-completion-card" key={category.category.id}>
            <header>
              <div>
                <strong>{category.category.name}</strong>
                <span>{category.eligibleVehicleCount} eligible vehicles</span>
              </div>
              <b>{category.completeJudgeCount}/{category.judgeCount}</b>
            </header>

            {category.judges.length ? (
              <div className="judge-completion-list">
                {category.judges.map((judge) => (
                  <div className={judge.complete ? "complete" : ""} key={judge.judgeKey}>
                    <CheckCircle2 size={18} />
                    <span>{judge.judgeName}</span>
                    <strong>{judge.rankedCount}/10</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">No judge picks recorded yet.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
