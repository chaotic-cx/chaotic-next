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

interface GitlabWebhookUser {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

interface GitlabWebhookLabel {
  id: number;
  title: string;
  color: string;
  project_id: number | null;
  created_at: string;
  updated_at: string;
  template: boolean;
  description: string | null;
  type: string;
  group_id: number | null;
}

interface GitlabWebhookCommit {
  id: string;
  message: string;
  title?: string;
  timestamp: string;
  url: string;
  author: { name: string; email: string };
}

interface GitlabWebhookProject {
  id: number;
  name: string;
  description?: string | null;
  web_url: string;
  avatar_url: string | null;
  git_ssh_url: string;
  git_http_url: string;
  namespace: string;
  visibility_level: number;
  path_with_namespace: string;
  default_branch: string;
  ci_config_path?: string | null;
}

export interface PipelineWebhookDto {
  object_kind: 'pipeline';
  object_attributes: {
    id: number;
    iid: number;
    name?: string;
    ref: string;
    tag: boolean;
    sha: string;
    before_sha: string;
    source: string;
    status: string;
    detailed_status?: string;
    stages?: string[] | null;
    created_at: string;
    finished_at?: string | null;
    duration?: number | null;
    queued_duration?: number | null;
    protected_ref?: boolean;
    default_branch?: boolean;
    variables?: { key: string; value: string }[] | null;
    url: string;
  };
  merge_request?: {
    id: number;
    iid: number;
    title: string;
    source_branch: string;
    source_project_id: number;
    target_branch: string;
    target_project_id: number;
    state: string;
    merge_status: string;
    detailed_merge_status: string;
    url: string;
  } | null;
  user?: GitlabWebhookUser;
  project?: { id: number };
  commit?: GitlabWebhookCommit;
  source_pipeline?: {
    project: { id: number; web_url: string; path_with_namespace: string };
    pipeline_id: number;
    job_id: number;
  };
  builds?:
    | {
        id: number;
        stage: string;
        name: string;
        status: string;
        created_at: string;
        started_at?: string | null;
        finished_at?: string | null;
        duration?: number | null;
        queued_duration?: number | null;
        failure_reason?: string | null;
        when: string;
        manual: boolean;
        allow_failure: boolean;
        user?: GitlabWebhookUser;
        runner?: {
          id: number;
          description: string;
          active: boolean;
          runner_type: string;
          is_shared?: boolean;
          tags?: string[] | null;
        } | null;
        artifacts_file?: { filename: string | null; size: number | null };
        environment?: { name: string; action: string; deployment_tier: string } | null;
      }[]
    | null;
}

interface MergeRequestWebhookReviewer {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
  email?: string;
  state?: string;
  re_requested?: boolean;
}

interface MergeRequestWebhookAttributes {
  action?: 'open' | 'close' | 'reopen' | 'update' | 'approval' | 'approved' | 'unapproval' | 'unapproved' | 'merge';
  actioned_at?: string;
  approval_rules?: {
    id: number;
    approvals_required: number;
    name: string;
    rule_type: string;
    report_type?: string | null;
    merge_request_id?: number;
    section?: string | null;
    modified_from_project_rule?: boolean;
    orchestration_policy_idx?: number | null;
    vulnerabilities_allowed?: number;
    scanners?: string[];
    severity_levels?: string[];
    vulnerability_states?: string[];
    security_orchestration_policy_configuration_id?: number | null;
    scan_result_policy_id?: number | null;
    applicable_post_merge?: boolean | null;
    project_id: number;
    approval_policy_rule_id?: number | null;
    updated_at: string;
    created_at: string;
  }[];
  assignee_id?: number;
  assignee_ids?: number[];
  author_id?: number;
  blocking_discussions_resolved?: boolean;
  created_at?: string;
  description?: string | null;
  detailed_merge_status?: string;
  draft?: boolean;
  first_contribution?: boolean;
  head_pipeline_id?: number | null;
  human_time_change?: string | null;
  human_time_estimate?: string | null;
  human_total_time_spent?: string | null;
  id: number;
  iid: number;
  labels?: GitlabWebhookLabel[];
  last_commit?: GitlabWebhookCommit;
  last_edited_at?: string | null;
  last_edited_by_id?: number | null;
  merge_commit_sha?: string | null;
  merged_at?: string | null;
  merge_error?: string | null;
  merge_params?: { force_remove_source_branch: unknown };
  merge_status?: string;
  merge_user_id?: number | null;
  merge_when_pipeline_succeeds?: boolean;
  milestone_id?: number | null;
  oldrev?: string;
  prepared_at?: string | null;
  reviewer_ids?: number[];
  source_branch: string;
  source_project_id: number;
  squash_commit_sha?: string | null;
  state: string;
  state_id?: number;
  system?: boolean;
  system_action?: string;
  target_branch: string;
  target_branch_protected?: boolean;
  target_project_id: number;
  time_change?: number;
  time_estimate?: number;
  title: string;
  total_time_spent?: number;
  updated_at?: string;
  updated_by_id?: number | null;
  url?: string;
  work_in_progress?: boolean;
}

export interface MergeRequestWebhookBodyDto {
  object_kind: 'merge_request';
  event_type?: string;
  user?: GitlabWebhookUser;
  project?: GitlabWebhookProject;
  object_attributes: MergeRequestWebhookAttributes;
  changes?: Record<string, unknown>;
  labels?: GitlabWebhookLabel[];
  assignees?: GitlabWebhookUser[];
  reviewers?: MergeRequestWebhookReviewer[];
  repository?: { name: string; url: string; description: string; homepage: string };
}

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
