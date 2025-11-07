import { DiffChange } from './types';
import { DiffParsingError } from './errors';

export class DiffParser {
  private static readonly DIFF_LINE_REGEX = /^([+-])(.*)/;

  public static parse(rawDiff: string): DiffChange[] {
    try {
      if (rawDiff === null || rawDiff === undefined) {
        throw new DiffParsingError('Diff content cannot be null or undefined');
      }

      if (!rawDiff) {
        return [];
      }

      const changes: DiffChange[] = [];
      let lineNumber = 0;

      const lines = rawDiff.split('\n');

      for (const line of lines) {
        if (!line) continue;

        if (line.match(/^[+-] [^\s]/)) {
          continue;
        }

        if (line.startsWith(' ')) {
          lineNumber++;
          continue;
        }

        const match = this.DIFF_LINE_REGEX.exec(line);
        if (!match) {
          lineNumber++;
          continue;
        }

        const [, marker, content] = match;

        if (content === undefined) continue;

        if (content.trim().length === 0) continue;

        lineNumber++;

        changes.push({
          type: marker === '+' ? 'add' : 'delete',
          lineNumber,
          content: content,
        });
      }

      return changes;
    } catch (error: unknown) {
      if (error instanceof DiffParsingError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DiffParsingError(`Failed to parse diff: ${errorMessage}`);
    }
  }
}
