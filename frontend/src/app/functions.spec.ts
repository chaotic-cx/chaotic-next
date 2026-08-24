import { describe, expect, it } from 'vitest';
import { vtIndicatorLink } from './functions';

describe('vtIndicatorLink', () => {
  it('passes file hashes through unchanged', () => {
    expect(vtIndicatorLink({ type: 'file', value: 'abc123' })).toBe('https://www.virustotal.com/gui/file/abc123');
  });

  it('routes URL indicators through the search endpoint with an encoded query', () => {
    expect(vtIndicatorLink({ type: 'url', value: 'https://evil.example/payload.sh' })).toBe(
      'https://www.virustotal.com/gui/search?query=https%3A%2F%2Fevil.example%2Fpayload.sh',
    );
  });
});
