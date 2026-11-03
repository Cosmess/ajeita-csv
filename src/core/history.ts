import type { Dataset } from "./dataset";
import { planOp, type Op, type Plan } from "./ops";
import { applyPatch, type Patch } from "./patch";

export type Step = { op: Op; label: string; forward: Patch; inverse: Patch };
export type History = { done: Step[]; undone: Step[] };

// Passos mais antigos são descartados para limitar o uso de memória.
export const MAX_STEPS = 100;

export const emptyHistory = (): History => ({ done: [], undone: [] });

type Result = { dataset: Dataset; history: History };

export function execute(dataset: Dataset, history: History, op: Op, plan: Plan = planOp(dataset, op)): Result {
  const applied = applyPatch(dataset, plan.patch);
  const step: Step = { op, label: plan.label, forward: plan.patch, inverse: applied.inverse };
  return { dataset: applied.dataset, history: { done: [...history.done, step].slice(-MAX_STEPS), undone: [] } };
}

export function undo(dataset: Dataset, history: History): Result | undefined {
  const step = history.done.at(-1);
  if (!step) return undefined;
  const applied = applyPatch(dataset, step.inverse);
  return {
    dataset: applied.dataset,
    history: { done: history.done.slice(0, -1), undone: [...history.undone, step] },
  };
}

export function redo(dataset: Dataset, history: History): Result | undefined {
  const step = history.undone.at(-1);
  if (!step) return undefined;
  const applied = applyPatch(dataset, step.forward);
  return {
    dataset: applied.dataset,
    history: { done: [...history.done, { ...step, inverse: applied.inverse }], undone: history.undone.slice(0, -1) },
  };
}
