import type { InterviewConfig } from '../interview-types.js';

export { DIAGNOSE_QUICK } from './diagnose-quick.js';
export { DIAGNOSE_DEEP } from './diagnose-deep.js';
export { REWRITE } from './rewrite.js';
export { CONTEXT_BUILD } from './context-build.js';
export { SPEC_NEW } from './spec-new.js';
export { INTENT_INIT } from './intent-init.js';
export { EVAL_HARNESS } from './eval-harness.js';
export { CONSTRAINT_DESIGNER } from './constraint-designer.js';
export { SKILL_BUILD } from './skill-build.js';
export { HARNESS_AUDIT } from './harness-audit.js';
export { HARNESS_ROUTE } from './harness-route.js';
export { HARNESS_BRIEF } from './harness-brief.js';
export { SPEC_QA } from './spec-qa.js';

import { DIAGNOSE_QUICK } from './diagnose-quick.js';
import { DIAGNOSE_DEEP } from './diagnose-deep.js';
import { REWRITE } from './rewrite.js';
import { CONTEXT_BUILD } from './context-build.js';
import { SPEC_NEW } from './spec-new.js';
import { INTENT_INIT } from './intent-init.js';
import { EVAL_HARNESS } from './eval-harness.js';
import { CONSTRAINT_DESIGNER } from './constraint-designer.js';
import { SKILL_BUILD } from './skill-build.js';
import { HARNESS_AUDIT } from './harness-audit.js';
import { HARNESS_ROUTE } from './harness-route.js';
import { HARNESS_BRIEF } from './harness-brief.js';
import { SPEC_QA } from './spec-qa.js';

export const TEMPLATES: Record<string, InterviewConfig> = {
  'diagnose-quick': DIAGNOSE_QUICK,
  'diagnose-deep': DIAGNOSE_DEEP,
  'rewrite': REWRITE,
  'context-build': CONTEXT_BUILD,
  'spec-new': SPEC_NEW,
  'spec-qa': SPEC_QA,
  'intent-init': INTENT_INIT,
  'eval-harness': EVAL_HARNESS,
  'constraint-designer': CONSTRAINT_DESIGNER,
  'skill-build': SKILL_BUILD,
  'harness-audit': HARNESS_AUDIT,
  'harness-route': HARNESS_ROUTE,
  'harness-brief': HARNESS_BRIEF,
};
