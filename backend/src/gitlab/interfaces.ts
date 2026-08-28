export interface MrActor {
  userId: string;
  userName: string;
}

/**
 * Payload of the `gitlab.status` moleculer event emitted by chaotic-manager whenever it creates an
 * external commit status. Mirrors the GitLab commit status shape the frontend renders, so the backend
 * can build its per-pipeline external status map without calling the GitLab API.
 */
export interface GitlabStatusEvent {
  pipeline_id: number | undefined;
  name: string;
  status: string;
  description: string | undefined;
  target_url: string;
  started_at: string | null;
  finished_at: string | null;
}
