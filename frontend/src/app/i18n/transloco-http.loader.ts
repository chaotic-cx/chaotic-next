import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { type Translation, type TranslocoLoader } from '@jsverse/transloco';

const TRANSLATIONS_PATH = '/i18n';

@Service()
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    // eslint-disable-next-line @dr460nf1r3/prefer-http-resource -- TranslocoLoader must return an Observable
    return this.http.get<Translation>(`${TRANSLATIONS_PATH}/${lang}.json`);
  }
}
