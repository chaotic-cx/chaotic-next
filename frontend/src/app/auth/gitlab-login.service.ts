import { Service, inject } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { GenericOauthService } from 'ngx-better-auth';

@Service()
export class GitlabLoginService {
  private readonly genericOauthService = inject(GenericOauthService);
  private readonly messageToastService = inject(MessageToastService);

  login(callbackURL: string): void {
    this.genericOauthService
      .signIn({
        providerId: 'gitlab',
        callbackURL,
        errorCallbackURL: callbackURL,
        newUserCallbackURL: callbackURL,
      })
      .subscribe({
        error: () => this.messageToastService.error('Login failed', 'Could not start the GitLab sign-in flow.'),
      });
  }
}