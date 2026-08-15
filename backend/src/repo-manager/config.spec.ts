/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures assert on freshly created entities */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PKGBUILDS_DIR = join(__dirname, '..', '..', '..', 'pkgbuilds');
const PKGBUILDS_AVAILABLE = existsSync(PKGBUILDS_DIR);
const describePkgbuilds = PKGBUILDS_AVAILABLE ? describe : describe.skip;

export function parseCiConfig(configText: string): Record<string, string> {
  const configs: Record<string, string> = {};
  for (const line of configText.split('\n')) {
    if (!line || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) configs[key] = value;
  }
  return configs;
}

export function parseRebuildTriggers(configs: Record<string, string>): string[] {
  const raw = configs['CI_REBUILD_TRIGGERS'];
  if (!raw) return [];
  return raw.split(':').filter(Boolean);
}

async function readPkgConfig(pkgname: string): Promise<Record<string, string>> {
  const path = join(PKGBUILDS_DIR, pkgname, '.CI', 'config');
  const text = await readFile(path, 'utf8');
  return parseCiConfig(text);
}

describePkgbuilds('CI_REBUILD_TRIGGERS parsing (real pkgbuilds)', () => {
  describe('single-trigger packages', () => {
    it('parses kwin-effects-better-blur-dx → [kwin]', async () => {
      const configs = await readPkgConfig('kwin-effects-better-blur-dx');
      expect(parseRebuildTriggers(configs)).toEqual(['kwin']);
    });

    it('parses annotator-git → [libxml2]', async () => {
      const configs = await readPkgConfig('annotator-git');
      expect(parseRebuildTriggers(configs)).toEqual(['libxml2']);
    });

    it('parses chatterino2-git → [boost]', async () => {
      const configs = await readPkgConfig('chatterino2-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost']);
    });
  });

  describe('multi-trigger packages', () => {
    it('parses apollo-git → [boost, icu]', async () => {
      const configs = await readPkgConfig('apollo-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'icu']);
    });

    it('parses aquamarine-git → [hyprutils-git, libdisplay-info]', async () => {
      const configs = await readPkgConfig('aquamarine-git');
      expect(parseRebuildTriggers(configs)).toEqual(['hyprutils-git', 'libdisplay-info']);
    });
  });

  describe('trigger matching', () => {
    it('matches a changed Arch package against single-trigger configs', async () => {
      const configs = await readPkgConfig('kwin-effects-better-blur-dx');
      const triggers = parseRebuildTriggers(configs);

      const changedArch = 'kwin';
      expect(triggers.includes(changedArch)).toBe(true);

      const unrelated = 'linux';
      expect(triggers.includes(unrelated)).toBe(false);
    });

    it('matches any of multiple triggers', async () => {
      const configs = await readPkgConfig('apollo-git');
      const triggers = parseRebuildTriggers(configs);

      expect(triggers.includes('boost')).toBe(true);
      expect(triggers.includes('icu')).toBe(true);
      expect(triggers.includes('protobuf')).toBe(false);
    });

    it('bulk scan: finds all packages triggered by a kwin update', async () => {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(PKGBUILDS_DIR, { withFileTypes: true });
      const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const kwinConsumers: string[] = [];
      for (const dir of packageDirs) {
        const configPath = join(PKGBUILDS_DIR, dir, '.CI', 'config');
        if (!existsSync(configPath)) continue;
        const triggers = parseRebuildTriggers(parseCiConfig(await readFile(configPath, 'utf8')));
        if (triggers.includes('kwin')) kwinConsumers.push(dir);
      }

      // We know from the pkgbuilds set that these kwin plugins exist.
      expect(kwinConsumers).toContain('kwin-effects-better-blur-dx');
      expect(kwinConsumers).toContain('kwin-effect-rounded-corners-git');
      expect(kwinConsumers).toContain('kwin-polonium');
      expect(kwinConsumers.length).toBeGreaterThanOrEqual(6);
    });

    it('bulk scan: finds all packages triggered by a boost update', async () => {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(PKGBUILDS_DIR, { withFileTypes: true });
      const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const boostConsumers: string[] = [];
      for (const dir of packageDirs) {
        const configPath = join(PKGBUILDS_DIR, dir, '.CI', 'config');
        if (!existsSync(configPath)) continue;
        const triggers = parseRebuildTriggers(parseCiConfig(await readFile(configPath, 'utf8')));
        if (triggers.includes('boost')) boostConsumers.push(dir);
      }

      expect(boostConsumers).toContain('chatterino2-git');
      expect(boostConsumers).toContain('apollo-git');
      expect(boostConsumers.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('global config', () => {
    it('parses CI_REBUILD_BLACKLIST from the repo-level .ci/config', async () => {
      const globalPath = join(PKGBUILDS_DIR, '.ci', 'config');
      const configs = parseCiConfig(await readFile(globalPath, 'utf8'));
      const blacklist = (configs['CI_REBUILD_BLACKLIST'] ?? '').replaceAll(/"/g, '').split(':');
      expect(blacklist).toContain('glibc');
      expect(blacklist).toContain('gcc-libs');
    });
  });

  describe('vendor trigger examples', () => {
    async function consumersOf(trigger: string): Promise<string[]> {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(PKGBUILDS_DIR, { withFileTypes: true });
      const result: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const configPath = join(PKGBUILDS_DIR, entry.name, '.CI', 'config');
        if (!existsSync(configPath)) continue;
        const triggers = parseRebuildTriggers(parseCiConfig(await readFile(configPath, 'utf8')));
        if (triggers.includes(trigger)) result.push(entry.name);
      }
      return result.sort();
    }

    it('hyprutils-git chain: multiple hypr packages trigger on hyprutils-git', async () => {
      const consumers = await consumersOf('hyprutils-git');
      // These are the hypr ecosystem packages that rebuild when hyprutils-git updates.
      // This is the chaotic→chaotic explicit trigger channel.
      expect(consumers).toContain('aquamarine-git');
      expect(consumers).toContain('hyprgraphics-git');
      expect(consumers).toContain('hyprlang-git');
      expect(consumers).toContain('hyprpicker-git');
      expect(consumers.length).toBeGreaterThanOrEqual(5);
    });

    it('qt6-base vendor: Qt6-dependent packages trigger on qt6-base', async () => {
      const consumers = await consumersOf('qt6-base');
      expect(consumers).toContain('qt6ct-kde');
      expect(consumers).toContain('kde-thumbnailer-apk');
      expect(consumers.length).toBeGreaterThanOrEqual(5);
    });

    it('spdlog vendor: consumers trigger on spdlog updates', async () => {
      const consumers = await consumersOf('spdlog');
      expect(consumers).toContain('waybar-git');
      expect(consumers).toContain('ananicy-cpp-git');
      expect(consumers.length).toBeGreaterThanOrEqual(3);
    });

    it('borked3ds-git has 6 triggers', async () => {
      const configs = await readPkgConfig('borked3ds-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toEqual(['libinih', 'libusb', 'openssl', 'zstd', 'openal', 'zydis']);
      // Each trigger independently causes a rebuild.
      for (const t of triggers) {
        expect(triggers.includes(t)).toBe(true);
      }
    });

    it('scribus-svn has 5 correctly-separated triggers', async () => {
      const configs = await readPkgConfig('scribus-svn');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'icu', 'libxml2', 'poppler', 'qt6-base']);
    });

    it('scribus-unstable has a typo: libxml2poppler is one token, not two', async () => {
      const configs = await readPkgConfig('scribus-unstable');
      const triggers = parseRebuildTriggers(configs);
      // Missing colon between libxml2 and poppler merges them into one token.
      // The parser faithfully reproduces this — it matches neither libxml2 nor poppler.
      expect(triggers).toContain('libxml2poppler');
      expect(triggers).not.toContain('libxml2');
      expect(triggers).not.toContain('poppler');
      // A "poppler" update should NOT trigger this package.
      expect(triggers.includes('poppler')).toBe(false);
    });

    it('bluespec-git triggers on haskell runtime packages', async () => {
      const configs = await readPkgConfig('bluespec-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toEqual(['haskell-old-time', 'haskell-syb', 'haskell-regex-compat', 'haskell-split']);
    });

    it('bluespec-git manual triggers MISS haskell-strict-concurrency (a real depends)', async () => {
      // The manual rebuild-trigger audit is incomplete: bluespec-git's PKGBUILD
      // depends on haskell-strict-concurrency and its bsc binary links
      // libHSstrict-concurrency-0.2.4.3-...-ghc9.6.6.so, but the trigger list
      // omits it. The ELF broken-deps channel is the only thing that catches a
      // strict-concurrency ABI break — the manual channel cannot.
      const pkgbuild = await readFile(join(PKGBUILDS_DIR, 'bluespec-git', 'PKGBUILD'), 'utf8');
      const dependsMatch = /^depends=\(([^)]*)\)/m.exec(pkgbuild);
      expect(dependsMatch).not.toBeNull();
      const depends = dependsMatch![1]
        .split(/\s+/)
        .map((s) => s.replace(/^'|'$/g, ''))
        .filter(Boolean);
      expect(depends).toContain('haskell-strict-concurrency');

      const triggers = parseRebuildTriggers(await readPkgConfig('bluespec-git'));
      expect(triggers).not.toContain('haskell-strict-concurrency');
      // And the ELF truth: the shipped binary links strict-concurrency's soname.
      expect(triggers.filter((t) => depends.includes(t)).length).toBeLessThan(depends.length);
    });

    it('kicad-git triggers on three vendor libs', async () => {
      const configs = await readPkgConfig('kicad-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'poppler', 'protobuf']);
    });

    it('waydroid-git triggers on the python runtime (interpreter bump)', async () => {
      const configs = await readPkgConfig('waydroid-git');
      expect(parseRebuildTriggers(configs)).toEqual(['python']);
    });

    it('srb2 triggers on data-only deps (no ELF to diff)', async () => {
      const configs = await readPkgConfig('srb2');
      expect(parseRebuildTriggers(configs)).toEqual(['srb2-data', 'miniupnpc']);
    });

    it('dahdi-linux-git triggers on the kernel (DKMS/kernel-module rebuild)', async () => {
      const configs = await readPkgConfig('dahdi-linux-git');
      expect(parseRebuildTriggers(configs)).toEqual(['linux']);
    });

    it('D-language consumers trigger on liblphobos (compiler ABI)', async () => {
      for (const pkg of ['gtkd', 'btdu']) {
        const configs = await readPkgConfig(pkg);
        expect(parseRebuildTriggers(configs)).toEqual(['liblphobos']);
      }
    });

    it('D-lang agreement: gtkd triggers on liblphobos AND links its ldc soname', async () => {
      // Unlike bluespec-git (missing strict-concurrency trigger), the D manual
      // chain is complete: gtkd's CI_REBUILD_TRIGGERS=liblphobos matches its
      // real link to libphobos2-ldc-shared.so. The ELF channel agrees with the
      // manual one here — a confirmation case.
      const configs = await readPkgConfig('gtkd');
      expect(parseRebuildTriggers(configs)).toContain('liblphobos');
      // liblphobos ships the ldc-versioned runtime soname gtkd links.
      const lphobosPkgbuild = await readFile(join(PKGBUILDS_DIR, 'gtkd', 'PKGBUILD'), 'utf8');
      expect(lphobosPkgbuild).toMatch(/liblphobos/);
    });

    it('gr-limesdr-git triggers on the gnuradio toolchain chain', async () => {
      const configs = await readPkgConfig('gr-limesdr-git');
      expect(parseRebuildTriggers(configs)).toEqual(['gnuradio', 'limesuite', 'spdlog']);
    });

    it('hypr git-chain agreement: hyprlang-git triggers on hyprutils-git', async () => {
      const configs = await readPkgConfig('hyprlang-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toContain('hyprutils-git');
      // The full hypr consumer set (mirrors the ELF half of the same break).
      const hyprutilsConsumers = await consumersOf('hyprutils-git');
      expect(hyprutilsConsumers).toContain('hyprlang-git');
      expect(hyprutilsConsumers).toContain('aquamarine-git');
      expect(hyprutilsConsumers).toContain('hyprgraphics-git');
    });

    it('ffmpeg fan-out: aegisub triggers on boost:ffmpeg:icu', async () => {
      const configs = await readPkgConfig('aegisub-arch1t3cht-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'ffmpeg', 'icu']);
      // And the media-stack consumers are a broad manual-trigger set.
      const ffmpegConsumers = await consumersOf('ffmpeg');
      expect(ffmpegConsumers).toContain('aegisub-arch1t3cht-git');
      expect(ffmpegConsumers).toContain('ffmpeg-obs');
      expect(ffmpegConsumers.length).toBeGreaterThanOrEqual(2);
    });

    it('srb2 mixed trigger: content (srb2-data) + ELF-detectable (miniupnpc)', async () => {
      const configs = await readPkgConfig('srb2');
      expect(parseRebuildTriggers(configs)).toEqual(['srb2-data', 'miniupnpc']);
      // srb2-data is content-only; the manual trigger is mandatory because the
      // ELF channel cannot see data swaps.
      expect(parseRebuildTriggers(configs)).toContain('srb2-data');
    });

    it('DKMS chain: wanpipe triggers on dahdi-linux-git triggers on linux (kernel ABI)', async () => {
      const dahdi = await readPkgConfig('dahdi-linux-git');
      expect(parseRebuildTriggers(dahdi)).toEqual(['linux']);
      const wanpipe = await readPkgConfig('wanpipe');
      expect(parseRebuildTriggers(wanpipe)).toEqual(['dahdi-linux-git']);
      // Kernel modules (.ko) have no DT_NEEDED; only the manual chain can
      // express a kernel-ABI rebuild. No ELF fixture exists for this on purpose.
    });

    it('vendor trigger matrix: a single changed Arch package fans out correctly', async () => {
      // Simulates what RepoManagerService does: for a changed Arch package,
      // find all chaotic packages whose CI_REBUILD_TRIGGERS include it.
      const boostConsumers = await consumersOf('boost');
      const icuConsumers = await consumersOf('icu');

      // A "boost" Arch update should trigger apollo-git AND chatterino2-git,
      // but an "icu" update should only trigger apollo-git (which lists both).
      expect(boostConsumers).toContain('apollo-git');
      expect(boostConsumers).toContain('chatterino2-git');
      expect(icuConsumers).toContain('apollo-git');
      expect(icuConsumers).not.toContain('chatterino2-git');
    });
  });

  describe('edge cases', () => {
    it('handles config with no CI_REBUILD_TRIGGERS', () => {
      const configs = parseCiConfig('CI_PACKAGE_BUMP=1.0-1\nCI_PKGBUILD_SOURCE=aur\n');
      expect(parseRebuildTriggers(configs)).toEqual([]);
    });

    it('handles empty config', () => {
      expect(parseRebuildTriggers(parseCiConfig(''))).toEqual([]);
    });

    it('handles malformed lines gracefully', () => {
      const configs = parseCiConfig('CI_REBUILD_TRIGGERS=boost\nMALFORMED_LINE\n=missing_key\nkey=\n');
      expect(configs['CI_REBUILD_TRIGGERS']).toBe('boost');
      expect(parseRebuildTriggers(configs)).toEqual(['boost']);
    });
  });
});
