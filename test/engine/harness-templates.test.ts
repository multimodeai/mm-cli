import { describe, it, expect } from 'vitest';
import {
  HARNESS_AUDIT,
  HARNESS_ROUTE,
  HARNESS_BRIEF,
  TEMPLATES,
} from '../../src/engine/interview-templates.js';

describe('Harness Templates', () => {
  it('HARNESS_AUDIT has required InterviewConfig fields', () => {
    expect(HARNESS_AUDIT.id).toBe('harness-audit');
    expect(HARNESS_AUDIT.name).toBe('Harness Decision Audit');
    expect(HARNESS_AUDIT.systemPrompt).toContain('senior engineering advisor');
    expect(HARNESS_AUDIT.phases).toHaveLength(3);
    expect(HARNESS_AUDIT.guardrails.length).toBeGreaterThan(0);
    expect(HARNESS_AUDIT.artifactTemplate).toBeTruthy();
  });

  it('HARNESS_AUDIT.enableTools is true', () => {
    expect(HARNESS_AUDIT.enableTools).toBe(true);
  });

  it('HARNESS_AUDIT covers all 5 divergence dimensions', () => {
    expect(HARNESS_AUDIT.systemPrompt).toContain('Execution Philosophy');
    expect(HARNESS_AUDIT.systemPrompt).toContain('State & Memory');
    expect(HARNESS_AUDIT.systemPrompt).toContain('Context Management');
    expect(HARNESS_AUDIT.systemPrompt).toContain('Tool Integration');
    expect(HARNESS_AUDIT.systemPrompt).toContain('Multi-Agent');
  });

  it('HARNESS_ROUTE has required InterviewConfig fields', () => {
    expect(HARNESS_ROUTE.id).toBe('harness-route');
    expect(HARNESS_ROUTE.name).toBe('Harness Task Router');
    expect(HARNESS_ROUTE.systemPrompt).toContain('task routing advisor');
    expect(HARNESS_ROUTE.phases).toHaveLength(3);
    expect(HARNESS_ROUTE.guardrails.length).toBeGreaterThan(0);
  });

  it('HARNESS_ROUTE.enableTools is true', () => {
    expect(HARNESS_ROUTE.enableTools).toBe(true);
  });

  it('HARNESS_ROUTE includes routing principles', () => {
    expect(HARNESS_ROUTE.systemPrompt).toContain('LOCAL-COLLABORATIVE');
    expect(HARNESS_ROUTE.systemPrompt).toContain('CLOUD-ISOLATED');
    expect(HARNESS_ROUTE.systemPrompt).toContain('Supervision Level');
  });

  it('HARNESS_BRIEF has required InterviewConfig fields', () => {
    expect(HARNESS_BRIEF.id).toBe('harness-brief');
    expect(HARNESS_BRIEF.name).toBe('Architecture Decision Brief');
    expect(HARNESS_BRIEF.systemPrompt).toContain('technology strategy advisor');
    expect(HARNESS_BRIEF.phases).toHaveLength(3);
    expect(HARNESS_BRIEF.guardrails.length).toBeGreaterThan(0);
  });

  it('HARNESS_BRIEF.enableTools is true', () => {
    expect(HARNESS_BRIEF.enableTools).toBe(true);
  });

  it('HARNESS_BRIEF includes cost estimation formulas', () => {
    expect(HARNESS_BRIEF.systemPrompt).toContain('2-8 hours');
    expect(HARNESS_BRIEF.systemPrompt).toContain('1-4 weeks');
    expect(HARNESS_BRIEF.systemPrompt).toContain('$150/hour');
  });

  it('all three harness templates are in TEMPLATES registry', () => {
    expect(TEMPLATES['harness-audit']).toBe(HARNESS_AUDIT);
    expect(TEMPLATES['harness-route']).toBe(HARNESS_ROUTE);
    expect(TEMPLATES['harness-brief']).toBe(HARNESS_BRIEF);
  });
});
