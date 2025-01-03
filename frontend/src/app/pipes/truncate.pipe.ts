import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'truncate',
})
export class TruncatePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: any, words: number): SafeHtml {
    const replacedNewlines = value?.replace(/\n/g, '<br>');
    const truncatedText = this.truncate(replacedNewlines, words);

    return this.sanitizer.bypassSecurityTrustHtml(truncatedText);
  }

  private truncate(text: string, words: number): string {
    const wordsArray = text?.split(' ');
    const truncatedWords = wordsArray?.slice(0, words);
    const remainingWords = wordsArray?.slice(words);

    let truncatedText = truncatedWords?.join(' ');

    if (remainingWords?.length > 0) {
      truncatedText += ' <br> ' + this.truncate(remainingWords?.join(' '), words);
    }

    return truncatedText;
  }
}
