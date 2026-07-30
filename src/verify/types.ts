export interface VerifyCriterion {
  criterion: string;
  status: 'met' | 'not_met' | 'partial' | 'unclear' | 'unverifiable';
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  /**
   * HOW the status was reached — the honesty tier.
   * - 'executed':   a check command ran and its exit/output decided the status (ground truth).
   * - 'judged':     an LLM read the code and formed an opinion (static, never above medium confidence).
   * - 'unverified': no check ran and the LLM could not tell (needs a runtime proof).
   */
  source?: 'executed' | 'judged' | 'unverified';
}

export interface VerifyConstraint {
  constraint: string;
  type: 'must_do' | 'must_not' | 'prefer' | 'escalate';
  status: 'satisfied' | 'violated' | 'not_assessed';
  evidence: string;
}

export interface VerifyResult {
  specFile: string;
  timestamp: string;
  model: string;
  criteria: VerifyCriterion[];
  constraints: VerifyConstraint[];
  definitionOfDone: {
    met: boolean;
    reasoning: string;
  };
  summary: {
    totalCriteria: number;
    met: number;
    notMet: number;
    partial: number;
    unclear: number;
    unverifiable: number;
    /** criteria a check command PROVED (executed + met). */
    proven: number;
    /** criteria a check command DISPROVED (executed + not_met). */
    failed: number;
    /** criteria only an LLM judged (static, no command ran). */
    judged: number;
    /** whether an executable check manifest was found and run. */
    checksRan: boolean;
    score: string;
  };
}
