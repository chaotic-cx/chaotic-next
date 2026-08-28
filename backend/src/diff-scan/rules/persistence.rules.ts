import {
  addedLines,
  DATA_BINARY_EXTENSIONS,
  fileExtension,
  hasBinaryContent,
  hasBinaryExtension,
  INSTALL_SCRIPT_PATTERN,
  removedLineTexts,
  SYSTEMD_UNIT_PATTERN,
} from './diff-utils';
import { regexRule, type Rule } from './rule';

/** Rules that reason about old-vs-new context, which full-file scans cannot provide. */
const MR_DIFF_ONLY = ['mr-diff'] as const;

const RESTART_ALWAYS_PATTERN = /Restart\s*=\s*always/;
const RESTART_DELAY_PATTERN = /RestartSec\s*=\s*(?:[3-9]\d|\d{3,})/;
/** Keywords that only ever appear inside a [Timer] section of a systemd unit file. */
const TIMER_KEYWORD_PATTERN = /\[Timer]|OnBootSec|OnCalendar|OnUnitActiveSec|AccuracySec/;

const REAL_SYSTEMD_DAEMONS = [
  'homed',
  'hostnamed',
  'importd',
  'journald',
  'localed',
  'logind',
  'machined',
  'networkd',
  'oomd',
  'portabled',
  'resolved',
  'sysupdated',
  'timesyncd',
  'timedated',
  'udevd',
  'userdbd',
];
const SYSTEMD_MASQUERADE_PATTERN = new RegExp(
  `\\bsystemd-(?!${REAL_SYSTEMD_DAEMONS.map((daemon) => `${daemon}\\b`).join('|')})[a-z]+d\\b`,
);

export const PERSISTENCE_RULES: Rule[] = [
  {
    id: 'CAUR-INSTALL-NEW',
    name: 'New install scriptlet added',
    severity: 'warning',
    description:
      'Adds or ships a new .install or .hook file. These scriptlets run as root on every user machine during package install/upgrade and were the injection point of the 2026 AUR malware campaign.',
    check(change) {
      if (change.deleted_file || !INSTALL_SCRIPT_PATTERN.test(change.new_path)) return null;
      // Modifications of an existing scriptlet are CAUR-INSTALL-CHANGED's job;
      // full-file scans have no removed lines and flag the shipped scriptlet.
      if (removedLineTexts(change).length > 0) return null;
      if (!addedLines(change)[0]) return null;
      return {
        line: 1,
        match: change.new_path,
        note: change.new_file ? 'New install scriptlet' : 'Install scriptlet present',
      };
    },
  },
  {
    id: 'CAUR-INSTALL-CHANGED',
    name: 'Install scriptlet modified',
    severity: 'info',
    runsOn: MR_DIFF_ONLY,
    description:
      'Modifies an existing .install or .hook file. These scriptlets run as root on user machines and should be reviewed line by line.',
    check(change) {
      if (change.new_file || change.deleted_file || !INSTALL_SCRIPT_PATTERN.test(change.new_path)) return null;
      const firstAdded = addedLines(change)[0];
      return firstAdded ? { line: firstAdded.line, match: change.new_path } : null;
    },
  },
  {
    id: 'CAUR-BINARY-ADDED',
    name: 'Binary file added',
    severity: 'critical',
    runsOn: MR_DIFF_ONLY,
    description:
      'Adds a binary blob to the repository. Binaries cannot be reviewed as text and can hide arbitrary payloads; packages should build from source or download sources via source=() checksums. Committed archives and images are reported as a warning.',
    check(change) {
      if (change.deleted_file) return null;
      const binary = hasBinaryContent(change) || (change.new_file && hasBinaryExtension(change.new_path));
      if (!binary) return null;
      // Unknown or executable binary content stays critical; data blobs like committed
      // patch archives are merely unreviewable and drop to a warning.
      const severity = DATA_BINARY_EXTENSIONS.has(fileExtension(change.new_path)) ? 'warning' : undefined;
      return { line: 1, match: change.new_path, note: 'Binary content', severity };
    },
  },
  {
    id: 'CAUR-SYSTEMD-UNIT-ADDED',
    name: 'New systemd unit added',
    severity: 'warning',
    runsOn: MR_DIFF_ONLY,
    description:
      'Adds a systemd .service or .timer unit. Units grant persistence on user machines and their ExecStart must be reviewed carefully; the unit contents themselves are scanned by the persistence content rules.',
    check(change) {
      if (change.new_file && SYSTEMD_UNIT_PATTERN.test(change.new_path)) {
        return { line: 1, match: change.new_path, note: 'New systemd unit' };
      }
      return null;
    },
  },
  regexRule({
    id: 'PERSIST-001',
    name: 'Systemctl service activation',
    severity: 'critical',
    description:
      'Enables or starts systemd services from a script, a common persistence mechanism; a mere daemon-reload is reported separately as info.',
    pattern: /\bsystemctl\b[^\n]*\b(?:enable|start)\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-DAEMON-RELOAD',
    name: 'systemctl daemon-reload',
    severity: 'info',
    description:
      'Runs systemctl daemon-reload. Legacy scriptlet idiom that pacman hooks have made unnecessary, but harmless on its own.',
    pattern: /\bsystemctl\b[^\n]*\bdaemon-reload\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'PERSIST-002',
    name: 'Systemd timer scheduling from a scriptlet',
    severity: 'critical',
    description:
      'Creates or schedules systemd timers from an install scriptlet, granting recurring execution on user machines. Timer units shipped as files are reported separately as info.',
    pattern: TIMER_KEYWORD_PATTERN,
    scopes: ['install'],
  }),
  {
    id: 'CAUR-TIMER-UNIT',
    name: 'Systemd timer unit shipped',
    severity: 'info',
    description:
      'Ships a systemd timer unit file. Timers grant recurring execution on user machines; check what the paired service runs.',
    check(change) {
      if (!SYSTEMD_UNIT_PATTERN.test(change.new_path)) return null;
      const hit = addedLines(change).find((line) => TIMER_KEYWORD_PATTERN.test(line.text));
      return hit ? { line: hit.line, match: hit.text.trim() } : null;
    },
  },
  regexRule({
    id: 'CAUR-CRON-MODIFY',
    name: 'Crontab manipulation',
    severity: 'critical',
    description: 'Installs, edits or removes crontab entries, granting recurring execution outside package management.',
    // Listing (crontab -l) is reconnaissance at most and stays unflagged.
    pattern: /\bcrontab\b(?![^|;&\n]*\s-l\b)/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-CRON-FILE',
    name: 'Cron directory write',
    severity: 'warning',
    description:
      'References live cron spool directories outside $pkgdir; packages must ship cron entries inside the package payload instead.',
    pattern: /(?<!pkgdir[^\n]*)\/etc\/cron\.(?:d|daily|hourly|weekly|monthly)\b\/?|(?<!pkgdir[^\n]*)\/var\/spool\/cron/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-LDSO-PRELOAD',
    name: 'ld.so.preload modification',
    severity: 'critical',
    description:
      'Writes to /etc/ld.so.preload, force-loading a shared object into every newly started process — rootkit-grade persistence.',
    pattern: /\/etc\/ld\.so\.preload\b/,
    scopes: ['code'],
  }),
  {
    id: 'CAUR-RESTART-ALWAYS',
    name: 'Systemd restart persistence',
    severity: 'critical',
    description:
      'Combines Restart=always with an unusually long restart delay, the restart-persistence signature of the 2026 AUR malware campaign. Restart=always alone is normal service hardening.',
    check(change) {
      const lines = addedLines(change);
      if (!lines.some((line) => RESTART_ALWAYS_PATTERN.test(line.text))) return null;
      const delayLine = lines.find((line) => RESTART_DELAY_PATTERN.test(line.text));
      return delayLine ? { line: delayLine.line, match: delayLine.text.trim() } : null;
    },
  },
  regexRule({
    id: 'PERSIST-004',
    name: 'Boot script modification',
    severity: 'critical',
    description: 'Modifies boot-time or login-time scripts, which run with user or root privileges automatically.',
    // Paths below $pkgdir end up inside the package; only writes to the live /etc count.
    pattern: /(?<!pkgdir[^\n]*)\/etc\/(?:rc\.local|profile\.d\/|profile\b)/,
    skipQuoted: true,
  }),
  regexRule({
    id: 'PERSIST-005',
    name: 'Systemd unit dropped outside the package payload',
    severity: 'critical',
    description:
      'Writes a systemd unit into the live /etc/systemd/system directory instead of shipping it under $pkgdir. Units installed this way bypass pacman and survive package removal.',
    // Redirects like "cat <<EOF >/etc/systemd/system/x.service" land on the same line.
    pattern: /(?<!pkgdir[^\n]*)\/etc\/systemd\/system\/\S*\.(?:service|timer|path|socket|target)\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-AUR-REPLICATE',
    name: 'AUR repository manipulation',
    severity: 'critical',
    description:
      'Clones or queries AUR package repositories via the maintainer SSH endpoint. Package builds never talk to the AUR. The xsnow install-scriptlet worm replicated itself this way.',
    pattern: /ssh:\/\/aur@(?:aur\.)?archlinux\.org/,
    // No skipQuoted: the worm passes the URL as a quoted git argument.
    scopes: ['code'],
  }),
  regexRule({
    id: 'PERSIST-006',
    name: 'Systemd daemon masquerading',
    severity: 'critical',
    description:
      'References a systemd-*d-named binary that is not a real systemd component, a trick to hide malicious daemons from casual review.',
    pattern: SYSTEMD_MASQUERADE_PATTERN,
  }),
];
