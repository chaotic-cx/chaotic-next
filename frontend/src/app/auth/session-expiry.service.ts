import { HttpStatusCode } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { createAuthClient } from 'better-auth/client';
import { APP_CONFIG } from '../../environments/app-config.token';

/**
 * Tracks whether the signed-in session ended on the server, for example after it timed out.
 */
@Service()
export class SessionExpiryService {
  private readonly authClient = createAuthClient({ baseURL: inject(APP_CONFIG).authBaseUrl });
  private checking = false;

  readonly expired = signal(false);

  /**
   * Checks the session after a backend request answered 401.
   * A 401 alone does not prove an expired session, because a proxied GitLab call can return it too.
   */
  async reportUnauthorized(): Promise<void> {
    if (this.expired() || this.checking) return;

    this.checking = true;
    const alive = await this.sessionAlive();
    this.checking = false;

    if (alive === false) {
      this.expired.set(true);
    }
  }

  /**
   * Clears the expired state once a new sign-in created a session.
   */
  async recheck(): Promise<void> {
    const alive = await this.sessionAlive();
    if (alive === true) {
      this.expired.set(false);
    }
  }

  /**
   * True or false from the auth server, undefined when the check itself failed.
   */
  private async sessionAlive(): Promise<boolean | undefined> {
    try {
      const session = await this.authClient.getSession();
      if (session.error) return session.error.status === HttpStatusCode.Unauthorized ? false : undefined;

      return session.data !== null;
    } catch {
      return undefined;
    }
  }
}
