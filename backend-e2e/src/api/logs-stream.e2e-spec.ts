import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function readAll(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('Package build log stream (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('streams the upstream build log as SSE chunks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return new Response(textStream('build line one\nbuild line two\n'), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const base = await e2e.app.getUrl();
      const response = await fetch(`${base}/logs/firedragon/2026-08-28T10-00-00`);
      expect(response.status).toBe(200);

      const payload = await readAll(response);
      expect(payload).toContain('build line one');
      expect(payload).toContain('build line two');
      expect(fetchMock.mock.calls[0][0]).toContain('/firedragon/2026-08-28T10-00-00');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answers 404 when the build server has no such log', async () => {
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const base = await e2e.app.getUrl();
      const response = await fetch(`${base}/logs/no-such-pkg/2026-08-28T10-00-00`);

      expect(response.status).toBe(404);
      await response.body?.cancel();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
