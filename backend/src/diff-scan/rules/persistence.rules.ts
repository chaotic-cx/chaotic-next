import {
  addedLines,
  DATA_BINARY_EXTENSIONS,
  fileExtension,
  hasBinaryContent,
  hasBinaryExtension,
  INSTALL_SCRIPT_PATTERN,
  SYSTEMD_UNIT_PATTERN,
} from './diff-utils';
import type { Rule } from './rule';
import { regexRule } from './rule';

const RESTART_ALWAYS_PATTERN = /Restart\s*=\s*always/;
const RESTART_DELAY_PATTERN = /RestartSec\s*=\s*(?:[3-9]\d|\d{3,})/;

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
      'Adds a new .install or .hook file. These scriptlets run as root on every user machine during package install/upgrade and were the injection point of the 2026 AUR malware campaign.',
    check(change) {
      if (change.new_file && INSTALL_SCRIPT_PATTERN.test(change.new_path)) {
        return { line: 1, match: change.new_path, note: 'New install scriptlet' };
      }
      return null;
    },
  },
  {
    id: 'CAUR-INSTALL-CHANGED',
    name: 'Install scriptlet modified',
    severity: 'info',
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
    name: 'Systemctl service manipulation',
    severity: 'critical',
    description: 'Enables or starts systemd services from a script, a common persistence mechanism.',
    pattern: /\bsystemctl\b[^\n]*\b(?:enable|start|daemon-reload)\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'PERSIST-002',
    name: 'Systemd timer scheduling',
    severity: 'critical',
    description: 'Schedules systemd timers, which grant recurring execution on user machines.',
    pattern: /\[Timer]|OnBootSec|OnCalendar|OnUnitActiveSec|AccuracySec/,
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
    id: 'PERSIST-006',
    name: 'Systemd daemon masquerading',
    severity: 'critical',
    description:
      'References a systemd-*d-named binary that is not a real systemd component, a trick to hide malicious daemons from casual review.',
    pattern: SYSTEMD_MASQUERADE_PATTERN,
  }),
];
