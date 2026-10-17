import { afterNextRender, Component, type ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { injectActiveLanguage } from '../../pipes/active-language';
import { burstConfetti } from '../confetti';
import { completeCommand, konamiLines, runCommand, type ShellResult, welcomeLines } from './shell-commands';
import type { ShellLine } from './shell-line';

interface OutputLine {
  id: number;
  line: ShellLine;
}

const MAX_OUTPUT_LINES = 400;

const PROMPT = 'chaotic@aur:~$';

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

// The code starts with two ArrowUp keys.
const KONAMI_LEADING_UPS = 2;

/**
 * The progress after a wrong key. A wrong ArrowUp can still be the start of a new code.
 * After two ArrowUp keys, a third one keeps the progress at two.
 */
function konamiRestart(key: string, progress: number): number {
  if (key !== 'ArrowUp') return 0;

  if (progress === KONAMI_LEADING_UPS) return KONAMI_LEADING_UPS;

  return 1;
}

@Component({
  selector: 'chaotic-birthday-shell',
  imports: [TranslocoDirective],
  templateUrl: './birthday-shell.component.html',
  styleUrl: './birthday-shell.component.css',
  host: { '(click)': 'focusInput()' },
})
export class BirthdayShellComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly language = injectActiveLanguage();

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly screen = viewChild<ElementRef<HTMLElement>>('screen');

  private readonly history: string[] = [];
  private historyIndex = 0;
  private konamiProgress = 0;
  private nextLineId = 0;

  protected readonly prompt = PROMPT;
  protected readonly lines = signal<OutputLine[]>(this.toOutputLines(welcomeLines()));

  protected submit(event: Event): void {
    event.preventDefault();

    const input = this.input()?.nativeElement;
    if (!input) return;

    const text = input.value;
    input.value = '';
    this.execute(text);
  }

  protected handleKey(event: KeyboardEvent): void {
    this.trackKonamiCode(event.key);

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.showHistoryEntry(-1);

      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.showHistoryEntry(1);

      return;
    }

    if (event.key === 'Tab') {
      this.complete(event);
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      this.interrupt(event);
    }
  }

  /**
   * A click anywhere in the shell focuses the prompt, as in a real terminal.
   * A text selection stays, so visitors can still copy the output.
   */
  protected focusInput(): void {
    const selection = window.getSelection();
    if (selection && selection.toString() !== '') return;

    this.input()?.nativeElement.focus();
  }

  private interrupt(event: KeyboardEvent): void {
    const input = this.input()?.nativeElement;
    if (!input || input.selectionStart !== input.selectionEnd) return;

    event.preventDefault();

    this.append([{ kind: 'command', text: `${input.value}^C` }]);
    input.value = '';
    this.historyIndex = this.history.length;
  }

  private execute(text: string): void {
    const command = text.trim();
    this.append([{ kind: 'command', text: command }]);
    if (command === '') return;

    this.history.push(command);
    this.historyIndex = this.history.length;

    const result = runCommand(command, {
      history: this.history,
      language: this.language(),
      translate: (key, params) => this.transloco.translate(key, params),
    });
    this.apply(result);
  }

  private apply(result: ShellResult): void {
    if (result.clearScreen) {
      this.lines.set([]);
    } else {
      this.append(result.lines);
    }

    if (result.confetti) {
      void burstConfetti();
    }
  }

  private append(lines: ShellLine[]): void {
    const next = this.lines().concat(this.toOutputLines(lines));
    this.lines.set(next.slice(-MAX_OUTPUT_LINES));
    afterNextRender(() => this.scrollToEnd(), { injector: this.injector });
  }

  private toOutputLines(lines: ShellLine[]): OutputLine[] {
    const outputLines: OutputLine[] = [];
    for (const line of lines) {
      outputLines.push({ id: this.nextLineId, line });
      this.nextLineId += 1;
    }

    return outputLines;
  }

  private scrollToEnd(): void {
    const screen = this.screen()?.nativeElement;
    if (!screen) return;

    screen.scrollTop = screen.scrollHeight;
  }

  private showHistoryEntry(step: number): void {
    const input = this.input()?.nativeElement;
    if (!input || this.history.length === 0) return;

    this.historyIndex = Math.min(Math.max(this.historyIndex + step, 0), this.history.length);
    input.value = this.history[this.historyIndex] ?? '';
  }

  /**
   * Tab completes a command name. An empty prompt keeps the normal Tab, so keyboard users can leave the shell.
   */
  private complete(event: KeyboardEvent): void {
    const input = this.input()?.nativeElement;
    if (!input || input.value === '' || input.value.includes(' ')) return;

    event.preventDefault();

    const matches = completeCommand(input.value);
    if (matches.length === 1) {
      input.value = `${matches[0]} `;
      return;
    }

    if (matches.length > 1) {
      this.append([
        { kind: 'command', text: input.value },
        { kind: 'text', text: matches.join('  '), tone: 'plain' },
      ]);
    }
  }

  private trackKonamiCode(key: string): void {
    if (key !== KONAMI_CODE[this.konamiProgress]) {
      this.konamiProgress = konamiRestart(key, this.konamiProgress);
      return;
    }

    this.konamiProgress += 1;
    if (this.konamiProgress < KONAMI_CODE.length) return;

    this.konamiProgress = 0;
    const input = this.input()?.nativeElement;
    if (input) {
      input.value = '';
    }

    this.apply({ lines: konamiLines(), clearScreen: false, confetti: true });
  }
}
