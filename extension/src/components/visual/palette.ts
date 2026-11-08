import type { NodeGroup, StepKind } from '../../shared/types';

/** Category colours tuned for the cream paper background (all ≥ 4.5:1 against white text). */
export const GROUP_COLOR: Record<NodeGroup, string> = {
  problem: '#b23c27',
  method: '#4d57e6',
  concept: '#5f6276',
  data: '#237a5b',
  metric: '#9a6212',
  finding: '#0f7480',
  entity: '#3b3f4e',
};

export const STEP_COLOR: Record<StepKind, string> = {
  context: '#5f6276',
  problem: '#b23c27',
  data: '#237a5b',
  method: '#4d57e6',
  experiment: '#9a6212',
  result: '#0f7480',
  conclusion: '#090d1a',
};
