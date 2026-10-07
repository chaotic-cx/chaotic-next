import { countReviewQueue, isReviewQueueMergeRequest } from '@chaotic-next/shared-lib';
import { describe, expect, it } from 'vitest';

const mr = (...labels: string[]) => ({ labels });

describe('isReviewQueueMergeRequest', () => {
  it('accepts human-review merge requests that are not dangerous', () => {
    expect(isReviewQueueMergeRequest(mr('human-review'))).toBe(true);
    expect(isReviewQueueMergeRequest(mr('human-review', 'dangerous'))).toBe(false);
    expect(isReviewQueueMergeRequest(mr('nvchecker'))).toBe(false);
  });
});

describe('countReviewQueue', () => {
  it('counts unapproved queue merge requests, split by hold', () => {
    const counts = countReviewQueue([
      mr('human-review'),
      mr('human-review', 'nvchecker'),
      mr('human-review', 'hold'),
      mr('human-review', 'approved'),
      mr('human-review', 'dangerous'),
      mr('nvchecker'),
    ]);
    expect(counts).toEqual({ toReview: 2, onHold: 1 });
  });
});
