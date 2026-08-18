import { afterEach, describe, expect, it, vi } from 'vitest';
import { AurService } from './aur.service';

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('AurService.getSuggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the AUR suggestions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(['paru', 'paru-bin']));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new AurService().getSuggestions('par')).resolves.toEqual(['paru', 'paru-bin']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://aur.archlinux.org/rpc/v5/suggest/par',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('caps the number of suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(Array.from({ length: 50 }, (unused, i) => `pkg${i}`))));

    const suggestions = await new AurService().getSuggestions('pkg');
    expect(suggestions).toHaveLength(20);
  });

  it('drops non-string entries from the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(['paru', 42, null, 'paru-bin'])));

    await expect(new AurService().getSuggestions('par')).resolves.toEqual(['paru', 'paru-bin']);
  });

  it('returns no suggestions when the response is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ error: 'nope' })));

    await expect(new AurService().getSuggestions('par')).resolves.toEqual([]);
  });

  it('returns no suggestions on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response));

    await expect(new AurService().getSuggestions('par')).resolves.toEqual([]);
  });

  it('returns no suggestions when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(new AurService().getSuggestions('par')).resolves.toEqual([]);
  });
});
