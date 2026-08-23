import { CAMPAIGN_RULES } from './campaign.rules';
import { CONTAINER_CLOUD_RULES } from './container.cloud.rules';
import { CREDENTIAL_RULES } from './credentials.rules';
import { DESTRUCTIVE_RULES } from './destructive.rules';
import { DOWNLOAD_EXECUTE_RULES } from './download-execute.rules';
import { NETWORK_RULES } from './network.rules';
import { OBFUSCATION_RULES } from './obfuscation.rules';
import { PERSISTENCE_RULES } from './persistence.rules';
import { PRIVILEGE_RULES } from './privilege.rules';
import { PROVENANCE_RULES } from './provenance.rules';
import { REVERSE_SHELL_RULES } from './reverse-shell.rules';
import { SRCINFO_CONSISTENCY_RULES } from './srcinfo-consistency.rules';
import type { Rule } from './rule';

/**
 * Rule ID sources:
 *
 * - IDs without a prefix are kept identical to aurscan so findings can be
 *   cross-referenced against its catalog: https://github.com/manticore-projects/aurscan
 *   (internal/rules/rules.go, itself adapted from KiefStudioMA/ks-aur-scanner).
 *   Patterns and host lists were adapted to this codebase.
 *
 * - CAUR-* rules are our own additions, motivated by the June 2026 AUR
 *   supply-chain campaign IOCs: https://github.com/lenucksi/aur-malware-check.
 */
export const RULES: Rule<unknown>[] = [
  ...CAMPAIGN_RULES,
  ...CONTAINER_CLOUD_RULES,
  ...CREDENTIAL_RULES,
  ...DESTRUCTIVE_RULES,
  ...DOWNLOAD_EXECUTE_RULES,
  ...NETWORK_RULES,
  ...OBFUSCATION_RULES,
  ...PERSISTENCE_RULES,
  ...PRIVILEGE_RULES,
  ...PROVENANCE_RULES,
  ...REVERSE_SHELL_RULES,
  ...SRCINFO_CONSISTENCY_RULES,
];
