import { z } from 'zod';

export const aurScanBodySchema = z.strictObject({
  package: z.string().min(1).describe('AUR package name to scan'),
});

export type AurScanBodyDto = z.infer<typeof aurScanBodySchema>;

export const approveMrBodySchema = z.strictObject({
  iid: z.number().int().min(1).describe('Merge request IID'),
  sha: z
    .string()
    .regex(/^[0-9a-fA-F]{6,40}$/)
    .describe('HEAD SHA the approval must match'),
});

export type ApproveMrDto = z.infer<typeof approveMrBodySchema>;

export const flagMrBodySchema = z.strictObject({
  iid: z.number().int().min(1).describe('Merge request IID'),
  label: z.enum(['dangerous', 'hold']).describe('Label to apply'),
});

export type FlagMrDto = z.infer<typeof flagMrBodySchema>;

export const bumpPackagesGitlabBodySchema = z.strictObject({
  packages: z.array(z.string()).min(1).describe('Package names to bump'),
  repo: z.string().describe('Repository name'),
  ref: z.string().optional().describe('Git ref to commit on'),
});

export type BumpPackagesDto = z.infer<typeof bumpPackagesGitlabBodySchema>;

export const addPackageItemSchema = z.strictObject({
  pkgname: z.string().min(1),
  source: z.string().optional(),
});

export type AddPackageItemDto = z.infer<typeof addPackageItemSchema>;

export const addPackagesBodySchema = z.strictObject({
  packages: z.array(addPackageItemSchema).min(1),
  repo: z.string(),
  request_origin: z.string().min(1),
  request_reason: z.string().optional(),
  custom_request_reason: z.string().optional(),
  ref: z.string().optional(),
});

export type AddPackagesDto = z.infer<typeof addPackagesBodySchema>;

export const dropPackagesBodySchema = z.strictObject({
  packages: z.array(z.string()).min(1).describe('Package names to drop'),
  repo: z.string().describe('Repository name'),
  ref: z.string().optional().describe('Git ref to commit on'),
});

export type DropPackagesDto = z.infer<typeof dropPackagesBodySchema>;

export const runScheduleBodySchema = z.strictObject({
  scheduleId: z.number().int().min(1).describe('GitLab pipeline schedule ID'),
  repo: z.string().describe('Repository name'),
});

export type RunScheduleDto = z.infer<typeof runScheduleBodySchema>;

export const triggerPipelineBodySchema = z.strictObject({
  operation: z.string().describe('Pipeline operation to trigger'),
  ref: z.string().optional().describe('Git ref to run the pipeline on'),
  packages: z.string().optional(),
  trigger: z.string().optional(),
  add_packages: z.string().optional(),
  request_origin: z.string().optional(),
  request_reason: z.string().optional(),
  custom_request_reason: z.string().optional(),
});

export type TriggerPipelineDto = z.infer<typeof triggerPipelineBodySchema>;

const gitlabWebhookUserSchema = z.looseObject({
  id: z.number().int().min(1),
  name: z.string(),
  username: z.string(),
  avatar_url: z.string(),
  email: z.string(),
});

const gitlabWebhookLabelSchema = z.looseObject({
  id: z.number().int().min(1),
  title: z.string(),
  color: z.string(),
  project_id: z.number().int().min(1).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  template: z.boolean(),
  description: z.string().nullable(),
  type: z.string(),
  group_id: z.number().int().min(1).nullable(),
});

const gitlabWebhookCommitSchema = z.looseObject({
  id: z.string(),
  message: z.string(),
  title: z.string().optional(),
  timestamp: z.string(),
  url: z.string(),
  author: z.looseObject({ name: z.string(), email: z.string() }),
});

const gitlabWebhookProjectSchema = z.looseObject({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().nullable().optional(),
  web_url: z.string(),
  avatar_url: z.string().nullable(),
  git_ssh_url: z.string(),
  git_http_url: z.string(),
  namespace: z.string(),
  visibility_level: z.number().int(),
  path_with_namespace: z.string(),
  default_branch: z.string(),
  ci_config_path: z.string().nullable().optional(),
});

const pipelineWebhookAttributesSchema = z.looseObject({
  id: z.number().int().min(1),
  iid: z.number().int().min(1),
  name: z.string().optional(),
  ref: z.string(),
  tag: z.boolean(),
  sha: z.string(),
  before_sha: z.string(),
  source: z.string(),
  status: z.string(),
  detailed_status: z.string().optional(),
  stages: z.array(z.string()).nullable().optional(),
  created_at: z.string(),
  finished_at: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  queued_duration: z.number().nullable().optional(),
  protected_ref: z.boolean().optional(),
  default_branch: z.boolean().optional(),
  variables: z
    .array(z.looseObject({ key: z.string(), value: z.string() }))
    .nullable()
    .optional(),
  url: z.string(),
});

export const pipelineWebhookEventSchema = z.looseObject({
  object_kind: z.literal('pipeline'),
  object_attributes: pipelineWebhookAttributesSchema,
  merge_request: z
    .looseObject({
      id: z.number().int().min(1),
      iid: z.number().int().min(1),
      title: z.string(),
      source_branch: z.string(),
      source_project_id: z.number().int().min(1),
      target_branch: z.string(),
      target_project_id: z.number().int().min(1),
      state: z.string(),
      merge_status: z.string(),
      detailed_merge_status: z.string(),
      url: z.string(),
    })
    .nullable()
    .optional(),
  user: gitlabWebhookUserSchema.optional(),
  project: gitlabWebhookProjectSchema.pick({ id: true }).optional(),
  commit: gitlabWebhookCommitSchema.optional(),
  source_pipeline: z
    .looseObject({
      project: z.looseObject({ id: z.number().int().min(1), web_url: z.string(), path_with_namespace: z.string() }),
      pipeline_id: z.number().int().min(1),
      job_id: z.number().int().min(1),
    })
    .optional(),
  builds: z
    .array(
      z.looseObject({
        id: z.number().int().min(1),
        stage: z.string(),
        name: z.string(),
        status: z.string(),
        created_at: z.string(),
        started_at: z.string().nullable().optional(),
        finished_at: z.string().nullable().optional(),
        duration: z.number().nullable().optional(),
        queued_duration: z.number().nullable().optional(),
        failure_reason: z.string().nullable().optional(),
        when: z.string(),
        manual: z.boolean(),
        allow_failure: z.boolean(),
        user: gitlabWebhookUserSchema.optional(),
        runner: z
          .looseObject({
            id: z.number().int().min(1),
            description: z.string(),
            active: z.boolean(),
            runner_type: z.string(),
            is_shared: z.boolean().optional(),
            tags: z.array(z.string()).nullable().optional(),
          })
          .nullable()
          .optional(),
        artifacts_file: z.looseObject({ filename: z.string().nullable(), size: z.number().nullable() }).optional(),
        environment: z
          .looseObject({ name: z.string(), action: z.string(), deployment_tier: z.string() })
          .nullable()
          .optional(),
      }),
    )
    .nullable()
    .optional(),
});

export type PipelineWebhookDto = z.infer<typeof pipelineWebhookEventSchema>;

const mergeRequestWebhookReviewerSchema = z.looseObject({
  id: z.number().int().min(1),
  name: z.string(),
  username: z.string(),
  avatar_url: z.string(),
  email: z.string().optional(),
  state: z.string().optional(),
  re_requested: z.boolean().optional(),
});

const mergeRequestWebhookAttributesSchema = z.looseObject({
  action: z
    .enum(['open', 'close', 'reopen', 'update', 'approval', 'approved', 'unapproval', 'unapproved', 'merge'])
    .optional(),
  actioned_at: z.string().optional(),
  approval_rules: z
    .array(
      z.looseObject({
        id: z.number().int().min(1),
        approvals_required: z.number().int(),
        name: z.string(),
        rule_type: z.string(),
        report_type: z.string().nullable().optional(),
        merge_request_id: z.number().int().min(1).optional(),
        section: z.string().nullable().optional(),
        modified_from_project_rule: z.boolean().optional(),
        orchestration_policy_idx: z.number().int().nullable().optional(),
        vulnerabilities_allowed: z.number().int().optional(),
        scanners: z.array(z.string()).optional(),
        severity_levels: z.array(z.string()).optional(),
        vulnerability_states: z.array(z.string()).optional(),
        security_orchestration_policy_configuration_id: z.number().int().nullable().optional(),
        scan_result_policy_id: z.number().int().nullable().optional(),
        applicable_post_merge: z.boolean().nullable().optional(),
        project_id: z.number().int().min(1),
        approval_policy_rule_id: z.number().int().nullable().optional(),
        updated_at: z.string(),
        created_at: z.string(),
      }),
    )
    .optional(),
  assignee_id: z.number().int().min(1).optional(),
  assignee_ids: z.array(z.number().int().min(1)).optional(),
  author_id: z.number().int().min(1).optional(),
  blocking_discussions_resolved: z.boolean().optional(),
  created_at: z.string().optional(),
  description: z.string().nullable().optional(),
  detailed_merge_status: z.string().optional(),
  draft: z.boolean().optional(),
  first_contribution: z.boolean().optional(),
  head_pipeline_id: z.number().int().min(1).nullable().optional(),
  human_time_change: z.string().nullable().optional(),
  human_time_estimate: z.string().nullable().optional(),
  human_total_time_spent: z.string().nullable().optional(),
  id: z.number().int().min(1),
  iid: z.number().int().min(1),
  labels: z.array(gitlabWebhookLabelSchema).optional(),
  last_commit: gitlabWebhookCommitSchema.optional(),
  last_edited_at: z.string().nullable().optional(),
  last_edited_by_id: z.number().int().min(1).nullable().optional(),
  merge_commit_sha: z.string().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  merge_error: z.string().nullable().optional(),
  merge_params: z.looseObject({ force_remove_source_branch: z.unknown() }).optional(),
  merge_status: z.string().optional(),
  merge_user_id: z.number().int().min(1).nullable().optional(),
  merge_when_pipeline_succeeds: z.boolean().optional(),
  milestone_id: z.number().int().min(1).nullable().optional(),
  oldrev: z.string().optional(),
  prepared_at: z.string().nullable().optional(),
  reviewer_ids: z.array(z.number().int().min(1)).optional(),
  source_branch: z.string(),
  source_project_id: z.number().int().min(1),
  squash_commit_sha: z.string().nullable().optional(),
  state: z.string(),
  state_id: z.number().int().min(1).optional(),
  system: z.boolean().optional(),
  system_action: z.string().optional(),
  target_branch: z.string(),
  target_branch_protected: z.boolean().optional(),
  target_project_id: z.number().int().min(1),
  time_change: z.number().int().optional(),
  time_estimate: z.number().int().optional(),
  title: z.string(),
  total_time_spent: z.number().int().optional(),
  updated_at: z.string().optional(),
  updated_by_id: z.number().int().min(1).nullable().optional(),
  url: z.string().optional(),
  work_in_progress: z.boolean().optional(),
});

export const mergeRequestWebhookEventSchema = z.looseObject({
  object_kind: z.literal('merge_request'),
  event_type: z.string().optional(),
  user: gitlabWebhookUserSchema.optional(),
  project: gitlabWebhookProjectSchema.optional(),
  object_attributes: mergeRequestWebhookAttributesSchema,
  changes: z.record(z.string(), z.unknown()).optional(),
  labels: z.array(gitlabWebhookLabelSchema).optional(),
  assignees: z.array(gitlabWebhookUserSchema).optional(),
  reviewers: z.array(mergeRequestWebhookReviewerSchema).optional(),
  repository: z
    .looseObject({ name: z.string(), url: z.string(), description: z.string(), homepage: z.string() })
    .optional(),
});

export type MergeRequestWebhookBodyDto = z.infer<typeof mergeRequestWebhookEventSchema>;

// Only object_kind is validated. GitLab owns this payload shape; a schema drift
// here must never make the endpoint drop a live webhook with a 400.
export const gitlabWebhookBodySchema = z.discriminatedUnion('object_kind', [
  z.looseObject({ object_kind: z.literal('pipeline') }),
  z.looseObject({ object_kind: z.literal('merge_request') }),
]);

export type GitlabWebhookBodyDto = PipelineWebhookDto | MergeRequestWebhookBodyDto;

export const schedulesQuerySchema = z.strictObject({
  repo: z.string().min(1).describe('Repository name'),
});

export type SchedulesQueryDto = z.infer<typeof schedulesQuerySchema>;

export const aurSearchQuerySchema = z.strictObject({
  arg: z.string().min(1).describe('AUR search term'),
});

export type AurSearchQueryDto = z.infer<typeof aurSearchQuerySchema>;
