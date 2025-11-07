import axios, { AxiosInstance } from 'axios';
import { ApiResponse, GitLabConfig } from './types';
import { GitLabApiError, InvalidConfigError } from './errors';

export class GitLabClient {
  private client: AxiosInstance;
  private config: GitLabConfig;

  constructor(config: GitLabConfig) {
    this.validateConfig(config);
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'PRIVATE-TOKEN': config.privateToken,
      },
    });
  }

  private validateConfig(config: GitLabConfig): void {
    if (!config.baseUrl || !config.privateToken || !config.projectId) {
      throw new InvalidConfigError('Missing required configuration parameters');
    }
  }

  public async get<T>(
    path: string,
    params: { queryParams: Record<string, any> } = { queryParams: {} },
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get<T>(path, { params });
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      throw new GitLabApiError(
        error.message || 'GitLab API request failed',
        error.response?.status || 500,
        error.response?.data,
      );
    }
  }

  public async getOpenMergeRequests(page = 1, perPage = 100, options: { authorId?: number; maxResults?: number } = {}) {
    const { authorId, maxResults } = options;
    const response = await this.get<any[]>(`/api/v4/projects/${this.config.projectId}/merge_requests`, {
      queryParams: {
        state: 'opened',
        page,
        per_page: perPage,
        ...(authorId ? { author_id: authorId } : {}),
      },
    });

    if (maxResults && response.data) {
      response.data = response.data.slice(0, maxResults);
    }

    return response;
  }

  public async getCurrentUser() {
    return this.get<any>('/api/v4/user');
  }

  public async getMergeRequestDiff(mergeRequestIid: number) {
    const a = await this.get<any[]>(
      `/api/v4/projects/${this.config.projectId}/merge_requests/${mergeRequestIid}/diffs`,
    );
    return a;
  }
}
