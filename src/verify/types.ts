export interface VerifyCriterion {
  criterion: string;
  status: 'met' | 'not_met' | 'partial' | 'unclear' | 'unverifiable';
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
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
    score: string;
  };
}
