export interface GitLabConfig {
  baseUrl: string;
  privateToken: string;
  projectId: string | number;
}

export interface MergeRequestData {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_by: User;
  merge_user: User;
  merged_at: string;
  closed_by: null | User;
  closed_at: null | string;
  target_branch: string;
  source_branch: string;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  author: User;
  assignees: User[];
  assignee: User;
  reviewers: User[];
  source_project_id: number;
  target_project_id: number;
  labels: string[];
  draft: boolean;
  imported: boolean;
  imported_from: string;
  work_in_progress: boolean;
  milestone: null | string;
  merge_when_pipeline_succeeds: boolean;
  merge_status: string;
  detailed_merge_status: string;
  merge_after: null | string;
  sha: string;
  merge_commit_sha: string;
  squash_commit_sha: null | string;
  discussion_locked: null | boolean;
  should_remove_source_branch: boolean;
  force_remove_source_branch: boolean;
  prepared_at: string;
  reference: string;
  references: {
    short: string;
    relative: string;
    full: string;
  };
  web_url: string;
  time_stats: {
    time_estimate: number;
    total_time_spent: number;
    human_time_estimate: null | string;
    human_total_time_spent: null | string;
  };
  squash: boolean;
  squash_on_merge: boolean;
  task_completion_status: {
    count: number;
    completed_count: number;
  };
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  approvals_before_merge: null | number;
  subscribed: boolean;
  changes_count: string;
  latest_build_started_at: null | string;
  latest_build_finished_at: null | string;
  first_deployed_to_production_at: null | string;
  pipeline: null | any;
  head_pipeline: null | any;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  merge_error: null | string;
  user: {
    can_merge: boolean;
  };
  changes: CodeDiff[];
  overflow: boolean;
}

export interface User {
  id: number;
  username: string;
  name: string;
  state: string;
  locked: boolean;
  avatar_url: string;
  web_url: string;
}

export interface CodeDiff {
  old_path: string;
  new_path: string;
  diff: string;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'delete' | 'modify';
  lineNumber: number;
  content: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface GitLabError {
  message: string;
  status: number;
}
