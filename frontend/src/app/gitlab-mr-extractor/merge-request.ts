import { GitLabClient } from './gitlab-client';
import { DiffParser } from './diff-parser';
import { CodeDiff, MergeRequestData } from './types';

export interface FetchOptions {
  authorId?: number;
  maxResults?: number;
}

export class MergeRequestFetcher {
  constructor(private client: GitLabClient) {}

  public async fetchAllMerged(options: FetchOptions = {}): Promise<MergeRequestData[]> {
    const mergeRequests: MergeRequestData[] = [];
    let page = 1;
    let hasMore = true;
    const perPage = 100;

    try {
      while (hasMore && (!options.maxResults || mergeRequests.length < options.maxResults)) {
        const response = await this.client.getOpenMergeRequests(page, perPage, {
          authorId: options.authorId,
          maxResults: options.maxResults,
        });

        if (!response?.data) {
          throw new Error('Invalid API response: missing data');
        }

        const mrs = response.data;
        if (mrs.length === 0) {
          hasMore = false;
          continue;
        }

        const promises = [];
        for (const mr of mrs) {
          promises.push(this.client.getMergeRequestDiff(mr.iid));
        }
        const diffsResponses = await Promise.all(promises);

        let diffIndex = 0;
        for (const mr of mrs) {
          if (!diffsResponses[diffIndex]?.data) {
            throw new Error('Invalid API response: missing diff data');
          }
          const changes: CodeDiff[] = Array.isArray(diffsResponses[diffIndex].data)
            ? diffsResponses[diffIndex].data.map((change: any) => ({
                old_path: change.old_path,
                new_path: change.new_path,
                diff: change.diff,
                changes: DiffParser.parse(change.diff),
              }))
            : [];

          mergeRequests.push({
            id: mr.id,
            iid: mr.iid,
            project_id: mr.project_id,
            title: mr.title,
            description: mr.description,
            state: mr.state,
            created_at: mr.created_at,
            updated_at: mr.updated_at,
            merged_by: mr.merged_by,
            merge_user: mr.merge_user,
            merged_at: mr.merged_at,
            author: {
              id: mr.author.id,
              name: mr.author.name,
              username: mr.author.username,
              state: mr.author.state,
              locked: mr.author.locked,
              avatar_url: mr.author.avatar_url,
              web_url: mr.author.web_url,
            },
            changes,
            user_notes_count: mr.user_notes_count,
            upvotes: mr.upvotes,
            downvotes: mr.downvotes,
            assignees: mr.assignees,
            assignee: mr.assignee,
            reviewers: mr.reviewers,
            source_project_id: mr.source_project_id,
            target_project_id: mr.target_project_id,
            labels: mr.labels,
            draft: mr.draft,
            imported: mr.imported,
            imported_from: mr.imported_from,
            work_in_progress: mr.work_in_progress,
            milestone: mr.milestone,
            merge_when_pipeline_succeeds: mr.merge_when_pipeline_succeeds,
            merge_status: mr.merge_status,
            detailed_merge_status: mr.detailed_merge_status,
            merge_after: mr.merge_after,
            sha: mr.sha,
            merge_commit_sha: mr.merge_commit_sha,
            squash_commit_sha: mr.squash_commit_sha,
            discussion_locked: mr.discussion_locked,
            should_remove_source_branch: mr.should_remove_source_branch,
            force_remove_source_branch: mr.force_remove_source_branch,
            prepared_at: mr.prepared_at,
            reference: mr.reference,
            references: mr.references,
            web_url: mr.web_url,
            time_stats: mr.time_stats,
            squash: mr.squash,
            squash_on_merge: mr.squash_on_merge,
            task_completion_status: mr.task_completion_status,
            has_conflicts: mr.has_conflicts,
            blocking_discussions_resolved: mr.blocking_discussions_resolved,
            approvals_before_merge: mr.approvals_before_merge,
            subscribed: mr.subscribed,
            changes_count: mr.changes_count,
            latest_build_started_at: mr.latest_build_started_at,
            latest_build_finished_at: mr.latest_build_finished_at,
            first_deployed_to_production_at: mr.first_deployed_to_production_at,
            pipeline: mr.pipeline,
            head_pipeline: mr.head_pipeline,
            diff_refs: mr.diff_refs,
            merge_error: mr.merge_error,
            user: mr.user,
            closed_by: mr.closed_by,
            closed_at: mr.closed_at,
            target_branch: mr.target_branch,
            source_branch: mr.source_branch,
            overflow: mr.overflow,
          });

          if (options.maxResults && mergeRequests.length >= options.maxResults) {
            hasMore = false;
            break;
          }

          diffIndex++;
        }

        page++;
      }

      return mergeRequests;
    } catch (error) {
      throw error instanceof Error ? error : new Error('An unknown error occurred');
    }
  }
}
