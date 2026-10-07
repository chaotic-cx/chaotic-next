import { describe, expect, it } from 'vitest';
import { shortenUserAgentName } from './chart-useragent.component';

describe('shortenUserAgentName', () => {
  it('strips the platform comment and libalpm trailer from pacman user agents', () => {
    expect(shortenUserAgentName('pacman/7.1.0 (Linux x86_64) libalpm/15.0.0')).toBe('pacman/7.1.0');
  });

  it('strips the platform comment and everything behind it from browser user agents', () => {
    expect(shortenUserAgentName('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe(
      'Mozilla/5.0',
    );
  });

  it('matches the platform comment case-insensitively', () => {
    expect(shortenUserAgentName('some-agent/1.0 (linux-musl-x86_64) extra/2.0')).toBe('some-agent/1.0');
  });

  it('leaves short names without a platform comment untouched', () => {
    expect(shortenUserAgentName('yay/12.4.2')).toBe('yay/12.4.2');
  });

  it('truncates long names without a platform comment', () => {
    const name = 'a'.repeat(60);
    expect(shortenUserAgentName(name)).toBe(`${'a'.repeat(50)}...`);
  });

  it('leaves names at the length limit untouched', () => {
    const name = 'a'.repeat(50);
    expect(shortenUserAgentName(name)).toBe(name);
  });
});
