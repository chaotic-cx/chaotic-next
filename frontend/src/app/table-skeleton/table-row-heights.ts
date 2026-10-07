/**
 * Heights in pixels of one loaded row per table, measured in the browser at 1440 × 900.
 * Skeleton rows use them, so the table keeps its exact size when the data arrives.
 * Measure again when the cells of a table change.
 */
export const TABLE_ROW_HEIGHTS = {
  deployments: 57,
  packages: 57,
  adminPackages: 76,
  adminArchPackages: 57,
  adminRepos: 57,
  adminBuilders: 57,
  adminMrActions: 43,
  adminPipelineTriggers: 63,
  adminPackageBumps: 43,
  adminElfAnalysis: 63,
  adminBrokenReports: 42,
} as const;
