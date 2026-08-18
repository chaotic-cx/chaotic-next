import { describe, expect, it } from 'vitest';
import {
  BuildLogMarkers,
  elapsedSecondsBetween,
  elapsedSecondsFromMarkers,
  findBuildLogMarkers,
  parseLogTimestamp,
  SCAN_BUFFER_LENGTH,
} from './build-log-markers';

describe('parseLogTimestamp', () => {
  it('parses a zero-padded UTC timestamp as UTC', () => {
    expect(parseLogTimestamp('16/08/2026, 07:09:58')).toBe(Date.UTC(2026, 7, 16, 7, 9, 58));
  });

  it('parses non-padded values within a zero-padded string', () => {
    expect(parseLogTimestamp('01/02/2026, 00:00:00')).toBe(Date.UTC(2026, 1, 1, 0, 0, 0));
  });

  it('returns NaN for a malformed timestamp', () => {
    expect(Number.isNaN(parseLogTimestamp('not a date'))).toBe(true);
  });

  it('returns NaN when the timestamp lacks seconds', () => {
    expect(Number.isNaN(parseLogTimestamp('16/08/2026, 07:09'))).toBe(true);
  });
});

describe('elapsedSecondsBetween', () => {
  it('returns the difference in whole seconds', () => {
    expect(elapsedSecondsBetween(1000, 57000)).toBe(56);
  });

  it('floors sub-second remainder', () => {
    expect(elapsedSecondsBetween(1000, 56999)).toBe(55);
  });

  it('clamps negative differences to zero', () => {
    expect(elapsedSecondsBetween(5000, 1000)).toBe(0);
  });

  it('returns zero for equal timestamps', () => {
    expect(elapsedSecondsBetween(5000, 5000)).toBe(0);
  });
});

describe('findBuildLogMarkers', () => {
  it('finds builder, start and end markers in one buffer', () => {
    const log = [
      'Executing build on host builder01',
      'Processing build job at 16/08/2026, 07:09:58 UTC',
      'some build output',
      'Build job chaotic-aur/x86_64/firefox-nightly-bin finished at 16/08/2026, 07:10:54 UTC',
    ].join('\n');

    expect(findBuildLogMarkers(log, {})).toEqual({
      builder: 'builder01',
      buildStartMs: Date.UTC(2026, 7, 16, 7, 9, 58),
      buildEndMs: Date.UTC(2026, 7, 16, 7, 10, 54),
      endReason: 'success',
    });
  });

  it('keeps previously found markers', () => {
    const prior: BuildLogMarkers = {
      builder: 'builder01',
      buildStartMs: Date.UTC(2026, 7, 16, 7, 9, 58),
    };

    const markers = findBuildLogMarkers('Build job foo finished at 16/08/2026, 07:10:54 UTC', prior);

    expect(markers.builder).toBe('builder01');
    expect(markers.buildStartMs).toBe(prior.buildStartMs);
    expect(markers.buildEndMs).toBe(Date.UTC(2026, 7, 16, 7, 10, 54));
  });

  it('does not overwrite a resolved marker when the buffer still contains it', () => {
    const prior: BuildLogMarkers = { buildStartMs: 42 };
    const markers = findBuildLogMarkers('Processing build job at 16/08/2026, 07:09:58 UTC', prior);
    expect(markers.buildStartMs).toBe(42);
  });

  it('ignores a start marker with an unparseable timestamp', () => {
    const markers = findBuildLogMarkers('Processing build job at not-a-date UTC', {});
    expect(markers.buildStartMs).toBeUndefined();
  });

  it('finds a marker split across a chunk boundary', () => {
    const buffer = 'chunk one tail... Processing build job at 16/08/2026, 07:0';
    const continuation = '9:58 UTC';
    const markers = findBuildLogMarkers(buffer + continuation, {});
    expect(markers.buildStartMs).toBe(Date.UTC(2026, 7, 16, 7, 9, 58));
  });

  it('matches a partial tail even when it cannot complete a marker', () => {
    const markers = findBuildLogMarkers('Processing build job at 16/08/2026, 07:0', {});
    expect(markers.buildStartMs).toBeUndefined();
  });
});

describe('findBuildLogMarkers on failed builds', () => {
  it('detects a failed build without a finish timestamp', () => {
    const markers = findBuildLogMarkers('Job chaotic-aur/x86_64/firefox-nightly-bin failed', {});
    expect(markers.endReason).toBe('failed');
    expect(markers.buildEndMs).toBeUndefined();
  });

  it('detects a timed-out build', () => {
    const markers = findBuildLogMarkers('Job chaotic-aur/x86_64/foo reached a timeout during the build phase.', {});
    expect(markers.endReason).toBe('timed_out');
  });

  it('detects a canceled build', () => {
    const markers = findBuildLogMarkers(
      'Job chaotic-aur/x86_64/foo was canceled and replaced by a newer build request.',
      {},
    );
    expect(markers.endReason).toBe('canceled');
  });

  it('detects a node-disconnected build before the generic failed phrase', () => {
    const markers = findBuildLogMarkers(
      'Job chaotic-aur/x86_64/foo execution failed (node disconnected). Re-queuing.',
      {},
    );
    expect(markers.endReason).toBe('node_disconnected');
  });

  it('keeps the first end reason once the build has ended', () => {
    const prior: BuildLogMarkers = { endReason: 'canceled' };
    const markers = findBuildLogMarkers('Build job chaotic-aur/x86_64/foo finished at 16/08/2026, 07:10:54 UTC', prior);
    expect(markers.endReason).toBe('canceled');
    expect(markers.buildEndMs).toBeUndefined();
  });

  it('sets a success end even when the buffer also contains a failure line', () => {
    const markers = findBuildLogMarkers(
      'Job chaotic-aur/x86_64/foo execution failed (node disconnected). Re-queuing.\n'.concat(
        'Build job chaotic-aur/x86_64/foo finished at 16/08/2026, 07:10:54 UTC',
      ),
      {},
    );
    expect(markers.endReason).toBe('success');
    expect(markers.buildEndMs).toBe(Date.UTC(2026, 7, 16, 7, 10, 54));
  });
});

describe('elapsedSecondsFromMarkers', () => {
  it('returns elapsed when both start and end are known', () => {
    const markers: BuildLogMarkers = {
      buildStartMs: Date.UTC(2026, 7, 16, 7, 9, 58),
      buildEndMs: Date.UTC(2026, 7, 16, 7, 10, 54),
    };
    expect(elapsedSecondsFromMarkers(markers)).toBe(56);
  });

  it('returns undefined when start is missing', () => {
    const markers: BuildLogMarkers = { buildEndMs: Date.UTC(2026, 7, 16, 7, 10, 54) };
    expect(elapsedSecondsFromMarkers(markers)).toBeUndefined();
  });

  it('returns undefined when end is missing', () => {
    const markers: BuildLogMarkers = { buildStartMs: Date.UTC(2026, 7, 16, 7, 9, 58) };
    expect(elapsedSecondsFromMarkers(markers)).toBeUndefined();
  });
});

describe('streaming chunk accumulation', () => {
  /** Mirrors the component: append each chunk, scan before trimming the tail. */
  function streamChunks(chunks: string[]): BuildLogMarkers {
    let buffer = '';
    let markers: BuildLogMarkers = {};
    for (const chunk of chunks) {
      buffer += chunk;
      markers = findBuildLogMarkers(buffer, markers);
      if (buffer.length > SCAN_BUFFER_LENGTH) buffer = buffer.slice(-SCAN_BUFFER_LENGTH);
    }
    return markers;
  }

  it('keeps an early start marker when a single chunk carries trailing content', () => {
    // Regression: the start marker sits near the top of the log. A rolling
    // buffer trimmed before scanning would drop it once a chunk carries enough
    // trailing content, leaving buildEndMs set but buildStartMs undefined.
    const markers = streamChunks([
      'Processing build job at 16/08/2026, 07:09:58 UTC\n'
        .concat('x'.repeat(SCAN_BUFFER_LENGTH * 2))
        .concat('Build job chaotic-aur/x86_64/firefox-nightly-bin finished at 16/08/2026, 07:10:54 UTC'),
    ]);

    expect(markers.buildStartMs).toBe(Date.UTC(2026, 7, 16, 7, 9, 58));
    expect(markers.buildEndMs).toBe(Date.UTC(2026, 7, 16, 7, 10, 54));
    expect(elapsedSecondsFromMarkers(markers)).toBe(56);
  });

  it('resolves a start marker split across a chunk boundary before trimming', () => {
    const markers = streamChunks([
      'prefix\nProcessing build job at 16/08/2026, 07:0',
      '9:58 UTC\n'.concat('y'.repeat(SCAN_BUFFER_LENGTH * 2)),
    ]);

    expect(markers.buildStartMs).toBe(Date.UTC(2026, 7, 16, 7, 9, 58));
  });

  it('does not regress when start and end arrive in separate small chunks', () => {
    const markers = streamChunks([
      'Processing build job at 16/08/2026, 07:09:58 UTC\n',
      'middle\n',
      'Build job chaotic-aur/x86_64/firefox-nightly-bin finished at 16/08/2026, 07:10:54 UTC',
    ]);

    expect(elapsedSecondsFromMarkers(markers)).toBe(56);
  });
});
