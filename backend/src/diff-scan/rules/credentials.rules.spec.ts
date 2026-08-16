import { describe, expect, it } from 'vitest';
import { CREDENTIAL_RULES } from './credentials.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('credential rules', () => {
  it.each([
    ['CRED-001', 'cp ~/.ssh/id_rsa /tmp/key'],
    ['CRED-002', 'gpg --export-secret-keys --homedir ~/.gnupg'],
    ['CRED-003', 'cat /etc/shadow > /tmp/shadow'],
    ['CRED-003', 'aws configure list --profile default # reads ~/.aws/credentials'],
    ['BROWSER-001', 'tar czf backup.tgz ~/.mozilla/firefox'],
    ['BROWSER-002', 'sqlite3 ~/.mozilla/firefox/*/cookies.sqlite .dump'],
    ['BROWSER-002', 'cp "Login Data" /tmp/logins'],
    ['WALLET-001', 'find ~ -name wallet.dat -exec cp {} /tmp \\;'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(CREDENTIAL_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag unrelated home directory access', () => {
    const change = makeChange(addedOnlyDiff(['install -Dm644 foo.conf ~/.config/foo/config.conf']));
    expect(CREDENTIAL_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });
});
