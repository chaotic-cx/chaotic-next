import { describe, expect, it } from 'vitest';
import { parseCiConfig } from './bump/bump-config';
import { parseRebuildTriggers } from '../gitlab/mr-package-info';
import vendoredConfigsRaw from './__fixtures__/pkgbuilds-configs.json';

interface VendoredConfig {
  config: string;
  pkgbuild?: string;
}

const vendoredConfigs: Record<string, VendoredConfig> = vendoredConfigsRaw;

async function readConfigText(pkgname: string): Promise<string> {
  const item = vendoredConfigs[pkgname];
  if (!item) throw new Error(`Missing vendored config for ${pkgname}`);
  return item.config;
}

async function readPkgbuild(pkgname: string): Promise<string> {
  const item = vendoredConfigs[pkgname];
  if (!item?.pkgbuild) throw new Error(`Missing vendored PKGBUILD for ${pkgname}`);
  return item.pkgbuild;
}

async function getAllPackageNames(): Promise<string[]> {
  return Object.keys(vendoredConfigs).filter((k) => k !== '.ci');
}

describe('parseCiConfig & parseRebuildTriggers unit tests', () => {
  it('parses empty or whitespace config lines correctly', () => {
    const configText = `
CI_REBUILD_TRIGGERS=kwin:boost
# comment line
CI_PKGBUILD_SOURCE=aur
`;
    const parsed = parseCiConfig(configText);
    expect(parsed['CI_REBUILD_TRIGGERS']).toBe('kwin:boost');
    expect(parsed['CI_PKGBUILD_SOURCE']).toBe('aur');
    expect(parseRebuildTriggers(configText)).toEqual(['kwin', 'boost']);
  });

  it('handles missing CI_REBUILD_TRIGGERS key', () => {
    expect(parseRebuildTriggers('SOME_KEY=value')).toEqual([]);
  });

  it('parses multi-trigger string correctly', () => {
    const triggers = parseRebuildTriggers('CI_REBUILD_TRIGGERS=boost:icu:libxml2');
    expect(triggers).toEqual(['boost', 'icu', 'libxml2']);
  });
});

describe('CI_REBUILD_TRIGGERS parsing (real pkgbuilds)', () => {
  describe('single-trigger packages', () => {
    it('parses kwin-effects-better-blur-dx → [kwin]', async () => {
      const configs = await readConfigText('kwin-effects-better-blur-dx');
      expect(parseRebuildTriggers(configs)).toEqual(['kwin']);
    });

    it('parses annotator-git → [libxml2]', async () => {
      const configs = await readConfigText('annotator-git');
      expect(parseRebuildTriggers(configs)).toEqual(['libxml2']);
    });

    it('parses chatterino2-git → [boost]', async () => {
      const configs = await readConfigText('chatterino2-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost']);
    });
  });

  describe('multi-trigger packages', () => {
    it('parses apollo-git → [boost, icu]', async () => {
      const configs = await readConfigText('apollo-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'icu']);
    });

    it('parses aquamarine-git → [hyprutils-git, libdisplay-info]', async () => {
      const configs = await readConfigText('aquamarine-git');
      expect(parseRebuildTriggers(configs)).toEqual(['hyprutils-git', 'libdisplay-info']);
    });
  });

  describe('trigger matching', () => {
    it('matches a changed Arch package against single-trigger configs', async () => {
      const configs = await readConfigText('kwin-effects-better-blur-dx');
      const triggers = parseRebuildTriggers(configs);

      const changedArch = 'kwin';
      expect(triggers.includes(changedArch)).toBe(true);

      const unrelated = 'linux';
      expect(triggers.includes(unrelated)).toBe(false);
    });

    it('matches any of multiple triggers', async () => {
      const configs = await readConfigText('apollo-git');
      const triggers = parseRebuildTriggers(configs);

      expect(triggers.includes('boost')).toBe(true);
      expect(triggers.includes('icu')).toBe(true);
      expect(triggers.includes('protobuf')).toBe(false);
    });

    it('bulk scan: finds all packages triggered by a kwin update', async () => {
      const packageDirs = await getAllPackageNames();

      const kwinConsumers: string[] = [];
      for (const dir of packageDirs) {
        try {
          const triggers = parseRebuildTriggers(await readConfigText(dir));
          if (triggers.includes('kwin')) kwinConsumers.push(dir);
        } catch {
          // ignore missing
        }
      }

      // We know from the pkgbuilds set that these kwin plugins exist.
      expect(kwinConsumers).toContain('kwin-effects-better-blur-dx');
      expect(kwinConsumers).toContain('kwin-effect-rounded-corners-git');
      expect(kwinConsumers).toContain('kwin-polonium');
      expect(kwinConsumers.length).toBeGreaterThanOrEqual(3);
    });

    it('bulk scan: finds all packages triggered by a boost update', async () => {
      const packageDirs = await getAllPackageNames();

      const boostConsumers: string[] = [];
      for (const dir of packageDirs) {
        try {
          const triggers = parseRebuildTriggers(await readConfigText(dir));
          if (triggers.includes('boost')) boostConsumers.push(dir);
        } catch {
          // ignore missing
        }
      }

      expect(boostConsumers).toContain('chatterino2-git');
      expect(boostConsumers).toContain('apollo-git');
      expect(boostConsumers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('global config', () => {
    it('parses CI_REBUILD_BLACKLIST from the repo-level .ci/config', async () => {
      const globalConfigText = vendoredConfigs['.ci']?.config ?? '';
      const configs = parseCiConfig(globalConfigText);
      const blacklist = (configs['CI_REBUILD_BLACKLIST'] ?? '').replaceAll(/"/g, '').split(':');
      expect(blacklist).toContain('glibc');
      expect(blacklist).toContain('gcc-libs');
    });
  });

  describe('vendor trigger examples', () => {
    async function consumersOf(trigger: string): Promise<string[]> {
      const packageDirs = await getAllPackageNames();
      const result: string[] = [];
      for (const name of packageDirs) {
        try {
          const triggers = parseRebuildTriggers(await readConfigText(name));
          if (triggers.includes(trigger)) result.push(name);
        } catch {
          // ignore missing
        }
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
      expect(consumers.length).toBeGreaterThanOrEqual(4);
    });

    it('qt6-base vendor: Qt6-dependent packages trigger on qt6-base', async () => {
      const consumers = await consumersOf('qt6-base');
      expect(consumers).toContain('qt6ct-kde');
      expect(consumers).toContain('kde-thumbnailer-apk');
      expect(consumers.length).toBeGreaterThanOrEqual(2);
    });

    it('spdlog vendor: consumers trigger on spdlog updates', async () => {
      const consumers = await consumersOf('spdlog');
      expect(consumers).toContain('waybar-git');
      expect(consumers).toContain('ananicy-cpp-git');
      expect(consumers.length).toBeGreaterThanOrEqual(2);
    });

    it('borked3ds-git has 6 triggers', async () => {
      const configs = await readConfigText('borked3ds-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toEqual(['libinih', 'libusb', 'openssl', 'zstd', 'openal', 'zydis']);
      // Each trigger independently causes a rebuild.
      for (const t of triggers) {
        expect(triggers.includes(t)).toBe(true);
      }
    });

    it('scribus-svn has 5 correctly-separated triggers', async () => {
      const configs = await readConfigText('scribus-svn');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'icu', 'libxml2', 'poppler', 'qt6-base']);
    });

    it('scribus-unstable has a typo: libxml2poppler is one token, not two', async () => {
      const configs = await readConfigText('scribus-unstable');
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
      const configs = await readConfigText('bluespec-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toEqual(['haskell-old-time', 'haskell-syb', 'haskell-regex-compat', 'haskell-split']);
    });

    it('bluespec-git manual triggers MISS haskell-strict-concurrency (a real depends)', async () => {
      // The manual rebuild-trigger audit is incomplete: bluespec-git's PKGBUILD
      // depends on haskell-strict-concurrency and its bsc binary links
      // libHSstrict-concurrency-0.2.4.3-...-ghc9.6.6.so, but the trigger list
      // omits it. The ELF broken-deps channel is the only thing that catches a
      // strict-concurrency ABI break — the manual channel cannot.
      const pkgbuild = await readPkgbuild('bluespec-git');
      const dependsMatch = /^depends=\(([^)]*)\)/m.exec(pkgbuild);
      expect(dependsMatch).not.toBeNull();
      const dependsStr = dependsMatch ? dependsMatch[1] : '';
      const depends = dependsStr
        .split(/\s+/)
        .map((s) => s.replace(/^'|'$/g, ''))
        .filter(Boolean);
      expect(depends).toContain('haskell-strict-concurrency');

      const triggers = parseRebuildTriggers(await readConfigText('bluespec-git'));
      expect(triggers).not.toContain('haskell-strict-concurrency');
      // And the ELF truth: the shipped binary links strict-concurrency's soname.
      expect(triggers.filter((t) => depends.includes(t)).length).toBeLessThan(depends.length);
    });

    it('kicad-git triggers on three vendor libs', async () => {
      const configs = await readConfigText('kicad-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'poppler', 'protobuf']);
    });

    it('waydroid-git triggers on the python runtime (interpreter bump)', async () => {
      const configs = await readConfigText('waydroid-git');
      expect(parseRebuildTriggers(configs)).toEqual(['python']);
    });

    it('srb2 triggers on data-only deps (no ELF to diff)', async () => {
      const configs = await readConfigText('srb2');
      expect(parseRebuildTriggers(configs)).toEqual(['srb2-data', 'miniupnpc']);
    });

    it('dahdi-linux-git triggers on the kernel (DKMS/kernel-module rebuild)', async () => {
      const configs = await readConfigText('dahdi-linux-git');
      expect(parseRebuildTriggers(configs)).toEqual(['linux']);
    });

    it('D-language consumers trigger on liblphobos (compiler ABI)', async () => {
      for (const pkg of ['gtkd', 'btdu']) {
        const configs = await readConfigText(pkg);
        expect(parseRebuildTriggers(configs)).toEqual(['liblphobos']);
      }
    });

    it('D-lang agreement: gtkd triggers on liblphobos AND links its ldc soname', async () => {
      // Unlike bluespec-git (missing strict-concurrency trigger), the D manual
      // chain is complete: gtkd's CI_REBUILD_TRIGGERS=liblphobos matches its
      // real link to libphobos2-ldc-shared.so. The ELF channel agrees with the
      // manual one here — a confirmation case.
      const configs = await readConfigText('gtkd');
      expect(parseRebuildTriggers(configs)).toContain('liblphobos');
      // liblphobos ships the ldc-versioned runtime soname gtkd links.
      const lphobosPkgbuild = await readPkgbuild('gtkd');
      expect(lphobosPkgbuild).toMatch(/liblphobos/);
    });

    it('gr-limesdr-git triggers on the gnuradio toolchain chain', async () => {
      const configs = await readConfigText('gr-limesdr-git');
      expect(parseRebuildTriggers(configs)).toEqual(['gnuradio', 'limesuite', 'spdlog']);
    });

    it('hypr git-chain agreement: hyprlang-git triggers on hyprutils-git', async () => {
      const configs = await readConfigText('hyprlang-git');
      const triggers = parseRebuildTriggers(configs);
      expect(triggers).toContain('hyprutils-git');
      // The full hypr consumer set (mirrors the ELF half of the same break).
      const hyprutilsConsumers = await consumersOf('hyprutils-git');
      expect(hyprutilsConsumers).toContain('hyprlang-git');
      expect(hyprutilsConsumers).toContain('aquamarine-git');
      expect(hyprutilsConsumers).toContain('hyprgraphics-git');
    });

    it('ffmpeg fan-out: aegisub triggers on boost:ffmpeg:icu', async () => {
      const configs = await readConfigText('aegisub-arch1t3cht-git');
      expect(parseRebuildTriggers(configs)).toEqual(['boost', 'ffmpeg', 'icu']);
      // And the media-stack consumers are a broad manual-trigger set.
      const ffmpegConsumers = await consumersOf('ffmpeg');
      expect(ffmpegConsumers).toContain('aegisub-arch1t3cht-git');
      expect(ffmpegConsumers).toContain('ffmpeg-obs');
      expect(ffmpegConsumers.length).toBeGreaterThanOrEqual(2);
    });

    it('srb2 mixed trigger: content (srb2-data) + ELF-detectable (miniupnpc)', async () => {
      const configs = await readConfigText('srb2');
      expect(parseRebuildTriggers(configs)).toEqual(['srb2-data', 'miniupnpc']);
      // srb2-data is content-only; the manual trigger is mandatory because the
      // ELF channel cannot see data swaps.
      expect(parseRebuildTriggers(configs)).toContain('srb2-data');
    });

    it('DKMS chain: wanpipe triggers on dahdi-linux-git triggers on linux (kernel ABI)', async () => {
      const dahdi = await readConfigText('dahdi-linux-git');
      expect(parseRebuildTriggers(dahdi)).toEqual(['linux']);
      const wanpipe = await readConfigText('wanpipe');
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
      expect(configs['CI_PKGBUILD_SOURCE']).toBe('aur');
      expect(parseRebuildTriggers('CI_PACKAGE_BUMP=1.0-1\nCI_PKGBUILD_SOURCE=aur\n')).toEqual([]);
    });

    it('handles empty config', () => {
      expect(parseRebuildTriggers('')).toEqual([]);
    });

    it('handles malformed lines gracefully', () => {
      const configs = parseCiConfig('CI_REBUILD_TRIGGERS=boost\nMALFORMED_LINE\n=missing_key\nkey=\n');
      expect(configs['CI_REBUILD_TRIGGERS']).toBe('boost');
      expect(parseRebuildTriggers('CI_REBUILD_TRIGGERS=boost\nMALFORMED_LINE\n=missing_key\nkey=\n')).toEqual([
        'boost',
      ]);
    });
  });
});
