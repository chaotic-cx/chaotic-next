import { MergeRequestDiffSchema, MergeRequestSchema } from '@gitbeaker/core';
import { z } from 'zod';
import type { PipelineSchema } from '@gitbeaker/rest';
import {
  diffScanFindingSchema,
  aurMaintainerChangeSchema,
  aurMaintainerInfoSchema,
  vtIndicatorReportSchema,
} from './aur';

export const gitlabJobSchema = z.object({
  id: z.number().describe('GitLab job ID'),
  name: z.string().describe('Job name as defined in .gitlab-ci.yml'),
  stage: z.string().describe('Pipeline stage the job belongs to'),
  status: z.string().describe('Job status (pending, running, success, failed, etc.)'),
  ref: z.string().describe('Git ref the job was triggered on'),
  webUrl: z.string().describe('URL to the job page in GitLab'),
  startedAt: z.string().optional().describe('ISO 8601 timestamp when the job started'),
  finishedAt: z.string().optional().describe('ISO 8601 timestamp when the job finished'),
  duration: z.number().optional().describe('Job duration in seconds'),
});
export type GitlabJob = z.infer<typeof gitlabJobSchema>;

export const gitlabLogChunkSchema = z.object({
  offset: z.number(),
  text: z.string(),
  complete: z.boolean(),
  status: z.string(),
});
export type GitlabLogChunk = z.infer<typeof gitlabLogChunkSchema>;

export const mrActionSchema = z.object({
  id: z.number().describe('Record ID'),
  mergeRequestIid: z.number().describe('Merge request IID'),
  commitSha: z.string().nullable().describe('Commit hash the action was performed on'),
  action: z.string().describe('Action performed on the merge request'),
  userId: z.string().describe('ID of the user who performed the action'),
  userName: z.string().describe('Name of the user who performed the action'),
  createdAt: z.string().describe('When the action was performed (ISO 8601)'),
});
export type MrAction = z.infer<typeof mrActionSchema>;

export enum PipelineOperation {
  NONE = 'none',
  BUMP_PACKAGES = 'bump-packages',
  SCHEDULE_PACKAGES = 'schedule-packages',
  RUN_SCHEDULE = 'run-schedule',
  DROP_PACKAGES = 'drop-packages',
  ADD_PACKAGES = 'add-packages',
}

export const PIPELINE_OPERATIONS: readonly PipelineOperation[] = [
  PipelineOperation.NONE,
  PipelineOperation.BUMP_PACKAGES,
  PipelineOperation.SCHEDULE_PACKAGES,
  PipelineOperation.RUN_SCHEDULE,
  PipelineOperation.DROP_PACKAGES,
  PipelineOperation.ADD_PACKAGES,
];

export const PIPELINE_OPERATION_GITLAB_LABELS: Record<PipelineOperation, string> = {
  [PipelineOperation.NONE]: 'None',
  [PipelineOperation.BUMP_PACKAGES]: 'Bump Packages',
  [PipelineOperation.SCHEDULE_PACKAGES]: 'Schedule Packages',
  [PipelineOperation.RUN_SCHEDULE]: 'Run Schedule',
  [PipelineOperation.DROP_PACKAGES]: 'Drop Packages',
  [PipelineOperation.ADD_PACKAGES]: 'Add Packages',
};

export const PKGBUILD_SOURCE_AUR = 'aur';

export const PIPELINE_REQUEST_REASONS = [
  'unset',
  'request',
  'depends',
  'depends:optional',
  'depends:make',
  'depends:check',
] as const;
export type PipelineRequestReason = (typeof PIPELINE_REQUEST_REASONS)[number];

// Regex constraints of the pipeline's spec:inputs section, shared by the
// backend validation and the frontend signal-forms validators.
export const PIPELINE_PACKAGES_REGEX = /^(?:[\w@.+/-]+(?::[\w@.+/-]+)*)?$/;
export const PIPELINE_ADD_PACKAGES_REGEX =
  /^([\w@.+/-]+\/(aur|(https?|git):\/\/\S+)(\s[\w@.+/-]+\/(aur|(https?|git):\/\/\S+))*)?$/;
export const PIPELINE_REF_REGEX = /^[\w@.+/-]{1,255}$/;
export const PIPELINE_PKG_BASE_REGEX = /^[\w@.+-]+$/;

/**
 * Inputs of the chaotic-aur pipeline, mirroring its `spec:inputs` section.
 * Which inputs are required depends on the chosen operation.
 */
export const pipelineTriggerInputsSchema = z.object({
  operation: z.enum(PipelineOperation),
  ref: z.string().optional(),
  packages: z.string().optional(),
  trigger: z.string().optional(),
  add_packages: z.string().optional(),
  request_origin: z.string().optional(),
  request_reason: z.string().optional(),
  custom_request_reason: z.string().optional(),
});
export type PipelineTriggerInputs = z.infer<typeof pipelineTriggerInputsSchema>;

export const pipelineTriggerResultSchema = z.object({
  pipelineId: z.number().describe('GitLab pipeline ID'),
  webUrl: z.string().describe('URL to the pipeline page in GitLab'),
  status: z.string().describe('Initial pipeline status'),
});
export type PipelineTriggerResult = z.infer<typeof pipelineTriggerResultSchema>;

export const pipelineScheduleOptionSchema = z.object({
  id: z.number().describe('Pipeline schedule ID'),
  description: z.string().nullable().describe('Schedule description'),
  active: z.boolean().describe('Whether the schedule is active'),
});
export type PipelineScheduleOption = z.infer<typeof pipelineScheduleOptionSchema>;

export const pipelineTriggerActionSchema = z.object({
  id: z.number().describe('Record ID'),
  ref: z.string().describe('Git ref the pipeline was triggered on'),
  commitSha: z.string().nullable().describe('Commit hash the pipeline was triggered on'),
  operation: z.string().describe('Pipeline operation name'),
  inputs: z.record(z.string(), z.string()).describe('Inputs passed to the pipeline'),
  pipelineId: z.number().optional().describe('GitLab pipeline ID'),
  webUrl: z.string().optional().describe('URL of the triggered pipeline'),
  userId: z.string().describe('ID of the user who triggered the pipeline'),
  userName: z.string().describe('Name of the user who triggered the pipeline'),
  createdAt: z.string().describe('When the pipeline was triggered (ISO 8601)'),
});
export type PipelineTriggerAction = z.infer<typeof pipelineTriggerActionSchema>;

export const packageBumpSchema = z.object({
  id: z.number().describe('Record ID'),
  bumpType: z.number().describe('Bump type ID'),
  trigger: z.number().describe('ID of the package that triggered the bump'),
  triggerFrom: z.number().describe('Origin of the trigger (0 for Arch, 1 for Chaotic)'),
  details: z.array(z.string()).optional().describe('Details of the bump'),
  timestamp: z.string().describe('When the bump happened (ISO 8601)'),
  pkgname: z.string().optional().describe('Name of the bumped package'),
  triggerName: z.string().optional().describe('Name of the triggering package'),
});
export type PackageBump = z.infer<typeof packageBumpSchema>;

export const externalCommitStatusSchema = z.object({
  id: z.number().describe('Status check ID'),
  name: z.string().describe('Status check name (e.g. "ci/test")'),
  status: z.string().describe('Current status (pending, running, success, failed)'),
  description: z.string().nullable().describe('Human-readable status description'),
  target_url: z.string().nullable().describe('URL linking to the external status check details'),
  started_at: z.string().nullable().describe('ISO 8601 timestamp when the check started'),
  finished_at: z.string().nullable().describe('ISO 8601 timestamp when the check finished'),
  pipeline_id: z.number().describe('GitLab pipeline ID this status belongs to'),
});
export type ExternalCommitStatus = z.infer<typeof externalCommitStatusSchema>;

export interface PipelineWithExternalStatus {
  commit: ExternalCommitStatus[];
  pipeline: PipelineSchema;
}

export const mrPackageInfoSchema = z.object({
  pkgname: z.string(),
  ciFiles: z.array(z.string()),
  pkgbuildSource: z.string(),
  manageAur: z.boolean(),
  rebuildTriggers: z.array(z.string()),
  nvchecker: z.boolean(),
});
export type MrPackageInfo = z.infer<typeof mrPackageInfoSchema>;

export type MergeRequestWithDiffs = Pick<
  MergeRequestSchema,
  | 'id'
  | 'iid'
  | 'title'
  | 'state'
  | 'web_url'
  | 'created_at'
  | 'updated_at'
  | 'assignees'
  | 'sha'
  | 'merge_status'
  | 'detailed_merge_status'
> & {
  diffs: MergeRequestDiffSchema[];
  labels: string[];
  scanFindings?: z.infer<typeof diffScanFindingSchema>[];
  vtReports?: z.infer<typeof vtIndicatorReportSchema>[];
  maintainers?: z.infer<typeof aurMaintainerInfoSchema>[];
  maintainerChange?: z.infer<typeof aurMaintainerChangeSchema>;
  packageInfo?: z.infer<typeof mrPackageInfoSchema>;
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string } | null;
};
