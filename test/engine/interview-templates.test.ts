import { describe, it, expect } from 'vitest';
import {
  DIAGNOSE_QUICK,
  DIAGNOSE_DEEP,
  REWRITE,
  CONTEXT_BUILD,
  SPEC_NEW,
  INTENT_INIT,
  EVAL_HARNESS,
  CONSTRAINT_DESIGNER,
  TEMPLATES,
} from '../../src/engine/interview-templates.js';
import type { InterviewConfig } from '../../src/engine/interview-types.js';

function validateTemplate(config: InterviewConfig) {
  expect(config.id).toBeTruthy();
  expect(config.name).toBeTruthy();
  expect(config.description).toBeTruthy();
  expect(config.systemPrompt).toBeTruthy();
  expect(config.systemPrompt.length).toBeGreaterThan(100);
  expect(config.phases.length).toBeGreaterThan(0);
  expect(config.guardrails.length).toBeGreaterThan(0);
  expect(config.artifactTemplate).toBeTruthy();

  // System prompt should contain the standard XML tags
  expect(config.systemPrompt).toContain('<role>');
  expect(config.systemPrompt).toContain('</role>');
  expect(config.systemPrompt).toContain('<instructions>');
  expect(config.systemPrompt).toContain('</instructions>');
}

describe('Interview Templates', () => {
  it('DIAGNOSE_QUICK has correct structure and prompt markers', () => {
    validateTemplate(DIAGNOSE_QUICK);
    expect(DIAGNOSE_QUICK.id).toBe('diagnose-quick');
    expect(DIAGNOSE_QUICK.systemPrompt).toContain('AI skills diagnostician');
    expect(DIAGNOSE_QUICK.systemPrompt).toContain('FOUR-DISCIPLINE SCORECARD');
    expect(DIAGNOSE_QUICK.phases).toHaveLength(2);
  });

  it('DIAGNOSE_DEEP has correct structure and prompt markers', () => {
    validateTemplate(DIAGNOSE_DEEP);
    expect(DIAGNOSE_DEEP.id).toBe('diagnose-deep');
    expect(DIAGNOSE_DEEP.systemPrompt).toContain('senior AI capability assessor');
    expect(DIAGNOSE_DEEP.systemPrompt).toContain('4-MONTH ROADMAP');
    expect(DIAGNOSE_DEEP.phases).toHaveLength(3);
  });

  it('REWRITE has correct structure and prompt markers', () => {
    validateTemplate(REWRITE);
    expect(REWRITE.id).toBe('rewrite');
    expect(REWRITE.systemPrompt).toContain('communication precision coach');
    expect(REWRITE.systemPrompt).toContain('GAP MAP');
  });

  it('CONTEXT_BUILD covers all 7 domains', () => {
    validateTemplate(CONTEXT_BUILD);
    expect(CONTEXT_BUILD.systemPrompt).toContain('DOMAIN 1');
    expect(CONTEXT_BUILD.systemPrompt).toContain('DOMAIN 7');
    expect(CONTEXT_BUILD.phases).toHaveLength(7);
  });

  it('SPEC_NEW has 3 phases and 7-section output', () => {
    validateTemplate(SPEC_NEW);
    expect(SPEC_NEW.systemPrompt).toContain('specification engineer');
    expect(SPEC_NEW.systemPrompt).toContain('PROJECT INTAKE');
    expect(SPEC_NEW.systemPrompt).toContain('DEEP INTERVIEW');
    expect(SPEC_NEW.systemPrompt).toContain('SPECIFICATION DOCUMENT');
    expect(SPEC_NEW.systemPrompt).toContain('7. DEFINITION OF DONE');
  });

  it('INTENT_INIT has Rigor Test section', () => {
    validateTemplate(INTENT_INIT);
    expect(INTENT_INIT.systemPrompt).toContain('RIGOR TEST');
    expect(INTENT_INIT.systemPrompt).toContain('PRIORITY HIERARCHY');
    expect(INTENT_INIT.systemPrompt).toContain('DECISION AUTHORITY MAP');
  });

  it('EVAL_HARNESS has personal eval harness pattern', () => {
    validateTemplate(EVAL_HARNESS);
    expect(EVAL_HARNESS.systemPrompt).toContain('personal test suite');
    expect(EVAL_HARNESS.systemPrompt).toContain('TEST CASE');
    expect(EVAL_HARNESS.systemPrompt).toContain('RESULT LOG');
  });

  it('CONSTRAINT_DESIGNER has 4-quadrant structure', () => {
    validateTemplate(CONSTRAINT_DESIGNER);
    expect(CONSTRAINT_DESIGNER.systemPrompt).toContain('MUST DO');
    expect(CONSTRAINT_DESIGNER.systemPrompt).toContain('MUST NOT DO');
    expect(CONSTRAINT_DESIGNER.systemPrompt).toContain('PREFER');
    expect(CONSTRAINT_DESIGNER.systemPrompt).toContain('ESCALATE');
  });

  it('TEMPLATES registry has all 8 templates', () => {
    expect(Object.keys(TEMPLATES)).toHaveLength(8);
    expect(TEMPLATES['diagnose-quick']).toBe(DIAGNOSE_QUICK);
    expect(TEMPLATES['diagnose-deep']).toBe(DIAGNOSE_DEEP);
    expect(TEMPLATES['rewrite']).toBe(REWRITE);
    expect(TEMPLATES['context-build']).toBe(CONTEXT_BUILD);
    expect(TEMPLATES['spec-new']).toBe(SPEC_NEW);
    expect(TEMPLATES['intent-init']).toBe(INTENT_INIT);
    expect(TEMPLATES['eval-harness']).toBe(EVAL_HARNESS);
    expect(TEMPLATES['constraint-designer']).toBe(CONSTRAINT_DESIGNER);
  });
});
