import { describe, expect, it } from 'vitest';
import { newMrChipDecision } from './mr-overview.component';

describe('newMrChipDecision', () => {
  const rendered = new Set([101, 102]);

  it('turns the dot on and highlights when a linked MR is in the fresh list', () => {
    expect(newMrChipDecision([101], true, rendered)).toEqual({ dot: true, highlightIid: 101 });
  });

  it('keeps the dot off when none of the linked MRs exist anymore', () => {
    expect(newMrChipDecision([201, 202], true, rendered)).toEqual({ dot: false, highlightIid: null });
  });

  it('highlights the first present iid of a partially present batch', () => {
    expect(newMrChipDecision([300, 102, 101], true, rendered)).toEqual({ dot: true, highlightIid: 102 });
  });

  it('decides nothing on a failed load so stale data cannot flip the dot', () => {
    expect(newMrChipDecision([999], false, rendered)).toEqual({ dot: null, highlightIid: null });
  });

  it('decides nothing for an empty batch', () => {
    expect(newMrChipDecision([], true, rendered)).toEqual({ dot: null, highlightIid: null });
  });
});
