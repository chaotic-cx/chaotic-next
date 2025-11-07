import { GitLabClient } from './gitlab-client';
import { FetchOptions, MergeRequestFetcher } from './merge-request';
import { GitLabConfig, MergeRequestData } from './types';

export * from './types';
export * from './errors';

export class GitLabMergeRequestExtractor {
  private client: GitLabClient;
  private fetcher: MergeRequestFetcher;

  constructor(config: GitLabConfig) {
    this.client = new GitLabClient(config);
    this.fetcher = new MergeRequestFetcher(this.client);
  }

  public async extractMergeRequests(options: FetchOptions = {}): Promise<MergeRequestData[]> {
    if (options.authorId === undefined) {
      const userResponse = await this.client.getCurrentUser();
      if (userResponse?.data) {
        options.authorId = userResponse.data.id;
      }
    }
    return this.fetcher.fetchOpenMergeRequests(options);
  }
}
