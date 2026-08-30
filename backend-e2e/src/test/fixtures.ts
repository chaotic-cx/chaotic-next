export const CHAOTIC_AUR_REPO = {
  name: 'chaotic-aur',
  repoUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds.git',
  isActive: true,
  gitRef: 'main',
  dbPath: 'https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/chaotic-aur.files',
  gitlabProjectId: '123456',
} as const;

export const GARUDA_REPO = {
  name: 'garuda',
  repoUrl: 'https://gitlab.com/garuda-linux/pkgbuilds.git',
  isActive: true,
  gitRef: 'main',
  dbPath: 'https://cdn-mirror.chaotic.cx/garuda/x86_64/garuda.files',
} as const;

export const BUILDERS = [
  { name: 'immortalis-1', builderClass: '9', description: 'Added on 2024-10-26T11:38:42.310Z' },
  { name: 'immortalis-2', builderClass: '6', description: 'Added on 2024-10-26T11:38:19.090Z' },
  { name: 'garuda-build', builderClass: '3', description: 'Added on 2024-10-26T18:41:55.844Z' },
  { name: 'stormwing-1', builderClass: null, description: 'Added on 2025-07-06T14:06:52.293Z' },
  { name: 'stormwing-2', builderClass: null, description: 'Added on 2025-07-06T13:35:05.843Z' },
  { name: 'tne-builder', builderClass: null, description: 'Added on 2025-09-10T04:01:38.254Z' },
  { name: 'dragon-builder', builderClass: null, description: 'Added on 2026-03-27T15:43:40.696Z' },
] as const;

export const PACKAGES = [
  {
    pkgname: 'firedragon',
    version: '2:13.1.1',
    pkgrel: 1,
    metadata: {
      desc: 'FireDragon is a cross-platform, feature-rich and privacy-focused web browser',
      url: 'https://gitlab.com/garuda-linux/firedragon/firedragon13',
      buildDate: '2025-01-15T00:00:00.000Z',
    },
    repo: GARUDA_REPO.name,
  },
  {
    pkgname: 'firedragon',
    version: '2:13.0.1',
    pkgrel: 1,
    metadata: {
      desc: 'FireDragon is a cross-platform, feature-rich and privacy-focused web browser',
      url: 'https://gitlab.com/garuda-linux/firedragon/firedragon13',
      buildDate: '2024-12-01T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'ayugram-desktop-git',
    version: '6.7.8.r12.gba8c1a6',
    pkgrel: 2,
    metadata: {
      desc: 'Desktop Telegram client with good customization and Ghost mode',
      url: 'https://github.com/AyuGram/AyuGramDesktop',
      buildDate: '2025-06-20T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'google-chrome',
    version: '151.0.7922.71',
    pkgrel: 1,
    metadata: {
      desc: 'The popular web browser by Google (Stable Channel)',
      url: 'https://www.google.com/chrome',
      buildDate: '2025-12-01T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'spotify',
    version: '1:1.2.92.147',
    pkgrel: 1,
    metadata: {
      desc: 'A proprietary music streaming service',
      url: 'https://www.spotify.com',
      buildDate: '2025-11-15T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'visual-studio-code-bin',
    version: '1.131.0',
    pkgrel: 1,
    metadata: {
      desc: 'Visual Studio Code (vscode): Editor for building and debugging modern web and cloud applications (official binary version)',
      url: 'https://code.visualstudio.com/',
      buildDate: '2025-12-05T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'gitkraken',
    version: '12.3.1',
    pkgrel: 1,
    metadata: {
      desc: 'The intuitive, fast, and beautiful cross-platform Git client.',
      url: 'https://www.gitkraken.com/',
      buildDate: '2025-11-20T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'paru',
    version: '2.1.0',
    pkgrel: 2,
    metadata: {
      desc: 'Feature packed AUR helper',
      url: 'https://github.com/Morganamilo/paru',
      buildDate: '2025-10-01T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'yay',
    version: '13.0.1',
    pkgrel: 1,
    metadata: {
      desc: 'Yet another yogurt. Pacman wrapper and AUR helper written in go.',
      url: 'https://github.com/Jguer/yay',
      buildDate: '2025-09-15T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
  {
    pkgname: 'powerlevel10k-git',
    version: 'r4325.9253fb1c',
    pkgrel: 1,
    metadata: {
      desc: 'Powerlevel10k is a theme for Zsh. It emphasizes speed, flexibility and out-of-the-box experience.',
      url: 'https://github.com/romkatv/powerlevel10k',
      buildDate: '2025-08-10T00:00:00.000Z',
    },
    repo: CHAOTIC_AUR_REPO.name,
  },
] as const;

export const ARCH_PACKAGES = [
  { pkgname: 'glibc', version: '2.41-1', arch: 'x86_64' },
  { pkgname: 'acl', version: '2.4.0-2', arch: 'x86_64' },
  { pkgname: 'attr', version: '2.6.0-1', arch: 'x86_64' },
  { pkgname: 'a52dec', version: '0.8.0-9', arch: 'x86_64' },
  { pkgname: 'aalib', version: '1.4rc5-16', arch: 'x86_64' },
] as const;

export const BROKEN_ELF_ANALYSIS = {
  pkgname: '0ad',
  pkgType: '0' as const,
  version: '0.28.0',
  neededSonames: ['libmock-broken-soname.so.99', 'libSDL2-2.0.so.0', 'libc.so.6'],
  providedSonames: ['libAtlasUI.so', 'libCollada.so'],
  directoriesOwned: ['usr/bin', 'usr/lib/0ad'],
  broken: true,
  brokenReasons: ['missing soname: libmock-broken-soname.so.99'],
} as const;

export const USER_AGENTS = [
  'pacman/6.1',
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Apt-Cacher-NG/3.7.5',
  'curl/8.10.1',
] as const;

export function routerHit(
  overrides: Partial<{
    package: string;
    version: string;
    repo: string;
    arch: string;
    hostname: string;
    ip: string;
    country: string;
    userAgent: string;
    timestamp: Date;
  }>,
) {
  return {
    package: overrides.package ?? 'firedragon',
    version: overrides.version ?? '2:13.1.1',
    repo: overrides.repo ?? 'garuda',
    arch: overrides.arch ?? 'x86_64',
    hostname: overrides.hostname ?? 'cdn-mirror.chaotic.cx',
    ip: overrides.ip ?? '203.0.113.1',
    country: overrides.country ?? 'DE',
    userAgent: overrides.userAgent,
    timestamp: overrides.timestamp ?? new Date(),
  };
}
