import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'chaotic-diff-renderer',
  templateUrl: './diff-renderer.component.html',
  styleUrl: './diff-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
})
export class DiffRendererComponent {
  /**
   * The diff string to be rendered.
   */
  readonly diff = input.required<string>();

  /**
   * Parses the diff string into an array of DiffLine objects.
   */
  readonly parsedLines = computed(() => {
    if (!this.diff()) return [];

    const lines = this.diff().split('\n');
    const result: DiffLine[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        result.push({
          type: 'hunk-header',
          content: line,
        });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        result.push({
          type: 'added',
          content: line,
        });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.push({
          type: 'removed',
          content: line,
        });
      } else {
        result.push({
          type: 'context',
          content: line,
        });
      }
    }

    return result;
  });

  /**
   * Returns the CSS class for a given diff line based on its type.
   * @param line The diff line to get the class for.
   */
  getLineClass(line: DiffLine): string {
    return line.type;
  }
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'hunk-header';
  content: string;
  lineNumber?: number;
}
