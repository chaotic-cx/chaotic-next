export interface PipelineWebhook {
  object_kind: 'pipeline';
  object_attributes: {
    id: number;
    iid: number;
    name: string;
    ref: string;
    tag: boolean;
    sha: string;
    before_sha: string;
    source: string;
    status: string;
    stages: string[];
    created_at: string;
    finished_at: string;
    duration: number;
    variables: {
      key: string;
      value: string;
    }[];
    url: string;
  };
  merge_request: {
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
  };
  user: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
    email: string;
  };
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url: string | null;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
  };
  commit: {
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
  };
  source_pipeline: {
    project: {
      id: number;
      web_url: string;
      path_with_namespace: string;
    };
    pipeline_id: number;
    job_id: number;
  };
  builds: {
    id: number;
    stage: string;
    name: string;
    status: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    duration: number | null;
    queued_duration: number | null;
    failure_reason: string | null;
    when: string;
    manual: boolean;
    allow_failure: boolean;
    user: {
      id: number;
      name: string;
      username: string;
      avatar_url: string;
      email: string;
    };
    runner: {
      id: number;
      description: string;
      active: boolean;
      runner_type: string;
      is_shared: boolean;
      tags: string[];
    } | null;
    artifacts_file: {
      filename: string | null;
      size: number | null;
    };
    environment: {
      name: string;
      action: string;
      deployment_tier: string;
    } | null;
  }[];
}

export interface MergeRequestWebhook {
  object_kind: 'merge_request';
  event_type: string;
  user: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
    email: string;
  };
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url: string;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
    ci_config_path: string;
    homepage: string;
    url: string;
    ssh_url: string;
    http_url: string;
  };
  object_attributes: {
    assignee_id: number;
    author_id: number;
    created_at: string;
    description: string;
    draft: boolean;
    head_pipeline_id: number | null;
    id: number;
    iid: number;
    last_edited_at: string | null;
    last_edited_by_id: number | null;
    merge_commit_sha: string | null;
    merge_error: string | null;
    merge_params: {
      force_remove_source_branch: boolean;
      should_remove_source_branch: boolean;
    };
    merge_status: string;
    merge_user_id: number | null;
    merge_when_pipeline_succeeds: boolean;
    milestone_id: number | null;
    source_branch: string;
    source_project_id: number;
    state_id: number;
    target_branch: string;
    target_project_id: number;
    time_estimate: number;
    title: string;
    updated_at: string;
    updated_by_id: number;
    prepared_at: string;
    assignee_ids: number[];
    blocking_discussions_resolved: boolean;
    detailed_merge_status: string;
    first_contribution: boolean;
    human_time_change: string | null;
    human_time_estimate: string | null;
    human_total_time_spent: string | null;
    labels: {
      id: number;
      title: string;
      color: string;
      project_id: number;
      created_at: string;
      updated_at: string;
      template: boolean;
      description: string;
      type: string;
      group_id: number | null;
    }[];
    last_commit: {
      id: string;
      message: string;
      title: string;
      timestamp: string;
      url: string;
      author: {
        name: string;
        email: string;
      };
    };
    reviewer_ids: number[];
    source: any;
    state: string;
    system: boolean;
    target: any;
    time_change: number;
    total_time_spent: number;
    url: string;
    work_in_progress: boolean;
    approval_rules: {
      id: number;
      approvals_required: number;
      name: string;
      rule_type: string;
      report_type: string | null;
      merge_request_id: number;
      section: string | null;
      modified_from_project_rule: boolean;
      orchestration_policy_idx: number | null;
      vulnerabilities_allowed: number;
      scanners: any[];
      severity_levels: any[];
      vulnerability_states: string[];
      security_orchestration_policy_configuration_id: number | null;
      scan_result_policy_id: number | null;
      applicable_post_merge: boolean;
      project_id: number;
      approval_policy_rule_id: number | null;
      updated_at: string;
      created_at: string;
    }[];
    action: string;
  };
  labels: {
    id: number;
    title: string;
    color: string;
    project_id: number;
    created_at: string;
    updated_at: string;
    template: boolean;
    description: string;
    type: string;
    group_id: number | null;
  }[];
  changes: Record<string, unknown>;
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
  };
  assignees: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
    email: string;
  }[];
}

export type GitLabWebHook = PipelineWebhook | MergeRequestWebhook;
