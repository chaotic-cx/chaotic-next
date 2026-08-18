import type { MergeRequestDiffSchema } from '@gitbeaker/core';

/** Builds a diff change with only the fields the scanner reads, filled with defaults. */
export function makeChange(
  diff: string,
  options: Partial<
    Pick<MergeRequestDiffSchema, 'new_path' | 'old_path' | 'new_file' | 'deleted_file' | 'renamed_file'>
  > = {},
): MergeRequestDiffSchema {
  const newPath = options.new_path ?? 'testpkg/PKGBUILD';
  return {
    old_path: options.old_path ?? newPath,
    a_mode: '100644',
    b_mode: '100644',
    new_file: options.new_file ?? false,
    renamed_file: options.renamed_file ?? false,
    deleted_file: options.deleted_file ?? false,
    diff,
    new_path: newPath,
  };
}

/** Builds a unified diff containing only added lines, like a newly created file. */
export function addedOnlyDiff(lines: string[]): string {
  return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n');
}

/** Finds a rule in a catalog by id, failing the spec when it is missing. */
export function ruleById<T extends { id: string }>(rules: T[], id: string): T {
  const rule = rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Rule ${id} not found in catalog`);
  return rule;
}
