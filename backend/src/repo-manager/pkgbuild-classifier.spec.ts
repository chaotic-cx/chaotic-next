import { describe, expect, it } from 'vitest';
import { classifyPkgbuild, isSourceCompiledPackage } from './pkgbuild-classifier';

describe('isSourceCompiledPackage', () => {
  describe('Electron/Node.js packages', () => {
    it('teams-for-linux: Electron wrapper with npm in makedepends', () => {
      const pkgbuild = [
        'pkgname=teams-for-linux',
        'pkgver=2.14.1',
        'pkgrel=1',
        'arch=("x86_64")',
        'depends=("gtk3" "libxss" "nss")',
        'makedepends=("nodejs>=18" "node-gyp" "npm")',
        'source=("teams-for-linux-2.14.1.tar.gz")',
        '',
        'build() {',
        '  cd "teams-for-linux-2.14.1"',
        '  npm install',
        '  npx electron-builder build --x64 --linux dir',
        '}',
        '',
        'package() {',
        '  cd "teams-for-linux-2.14.1"',
        '  cp -r "dist/linux-unpacked" "/opt/teams-for-linux"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });

    it('kando-git: Electron with npm run in build body', () => {
      const pkgbuild = [
        'pkgname=kando-git',
        'pkgver=2.0.0',
        'pkgrel=1',
        'arch=("any")',
        'depends=("electron")',
        'makedepends=("nodejs" "git")',
        'source=("git+https://github.com/kando-menu/kando.git")',
        '',
        'build() {',
        '  cd "kando-2.0.0"',
        '  npm install',
        '  npm run package',
        '}',
        '',
        'package() {',
        '  install -Dm755 "kando-2.0.0.AppImage" "/opt/kando/kando.AppImage"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('Binary packages', () => {
    it('simplenote-electron-bin: -bin suffix, no build function', () => {
      const pkgbuild = [
        'pkgname=simplenote-electron-bin',
        'pkgver=2.27.1',
        'pkgrel=1',
        'arch=("x86_64")',
        'depends=("nss" "gtk3" "libxss")',
        'source_x86_64=("https://example.com/Simplenote-linux-2.27.1-amd64.deb")',
        '',
        'package() {',
        '  bsdtar -xv -C "${pkgdir}" -f "${srcdir}/data.tar.gz"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });

    it('nvidia-340xx-lts: !strip with make in build', () => {
      const pkgbuild = [
        'pkgname=nvidia-340xx-lts',
        'pkgver=340.108',
        'pkgrel=10',
        'arch=("x86_64")',
        'makedepends=("nvidia-340xx-utils=340.108" "linux-lts>=6.1.14")',
        'options=(!strip)',
        'source=("NVIDIA-Linux-x86_64-340.108-no-compat32.run")',
        '',
        'build() {',
        '  cd "NVIDIA-Linux-x86_64-340.108-no-compat32/kernel"',
        '  make SYSSRC="/usr/src/linux-lts" module',
        '}',
        '',
        'package() {',
        '  install -Dt "${pkgdir}/extramodules" -m644 "kernel/nvidia.ko"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('Source compiled with !strip', () => {
    it('benben: !strip with meson and ninja in makedepends', () => {
      const pkgbuild = [
        'pkgname=benben',
        'pkgver=0.7.1',
        'pkgrel=1',
        'arch=("x86_64")',
        'makedepends=(fossil git meson ninja sbcl)',
        'options=(!strip)',
        'source=("fossil+https://example.com/benben")',
        '',
        'build() {',
        '  meson setup build benben',
        '  meson compile -C build',
        '}',
        '',
        'package() {',
        '  meson install -C build --destdir "$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Packages with no build() or no compiler', () => {
    it('package() only: no build function', () => {
      const pkgbuild = [
        'pkgname=extract-only',
        'pkgver=1.0.0',
        'pkgrel=1',
        'arch=("x86_64")',
        'depends=("glibc")',
        'makedepends=("gcc")',
        'source=("https://example.com/extract-only-1.0.0.tar.gz")',
        '',
        'package() {',
        '  cd "extract-only-1.0.0"',
        '  install -Dm755 app "${pkgdir}/usr/bin/app"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });

    it('build() with no compiler tools', () => {
      const pkgbuild = [
        'pkgname=gnome-shell-extension-tiling-assistant',
        'pkgver=54',
        'pkgrel=1',
        'arch=("any")',
        'depends=("gnome-shell")',
        'makedepends=("git")',
        'source=("git+https://github.com/Leleat/Tiling-Assistant.git#tag=v54")',
        '',
        'build() {',
        '  cd Tiling-Assistant',
        '  gnome-extensions pack "tiling-assistant@leleat-on-github" --force',
        '}',
        '',
        'package() {',
        '  cd Tiling-Assistant',
        '  install -d "$pkgdir/usr/share/gnome-shell/extensions/tiling-assistant@leleat-on-github"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('Source compiled: Cargo/Rust', () => {
    it('coolercontrold: cargo in makedepends, npm in comments', () => {
      const pkgbuild = [
        'pkgname=coolercontrold',
        'pkgver=4.3.1',
        'pkgrel=2',
        'arch=("x86_64")',
        'depends=("libdrm" "gcc-libs" "glibc")',
        'makedepends=("rust" "cargo" "protobuf")',
        'options=(!lto)',
        'source=("coolercontrol-4.3.1.tar.gz")',
        '',
        'build() {',
        '  # npm ci',
        '  # npm run build',
        '  cd "coolercontrold-4.3.1/coolercontrold"',
        '  export RUSTUP_TOOLCHAIN=stable',
        '  cargo build --release --locked',
        '}',
        '',
        'package() {',
        '  cd "coolercontrold-4.3.1/coolercontrold"',
        '  install -Dm755 "target/release/coolercontrold" -t "$pkgdir/usr/bin"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });

    it('alvr: cargo in makedepends', () => {
      const pkgbuild = [
        'pkgname=alvr',
        'pkgver=20.14.1',
        'pkgrel=4',
        'arch=("x86_64")',
        'makedepends=("git" "cargo" "clang" "vulkan-headers")',
        'options=(!lto)',
        'source=("alvr::git+https://github.com/alvr-org/ALVR.git#tag=v20.14.1")',
        '',
        'build() {',
        '  cd "alvr"',
        '  cargo build --frozen --release -p alvr_server_openvr',
        '}',
        '',
        'package() {',
        '  cd "alvr"',
        '  install -Dm755 target/release/alvr_dashboard -t "$pkgdir/usr/bin/"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Source compiled: Meson', () => {
    it('waybar-git: meson build', () => {
      const pkgbuild = [
        'pkgname=waybar-git',
        'pkgver=0.15.0.r822.g4e76d73',
        'pkgrel=1',
        'arch=("x86_64")',
        'depends=("fmt" "gtk-layer-shell" "gtkmm3")',
        'makedepends=("cmake" "git" "meson" "python-setuptools" "wayland-protocols")',
        'source=("waybar::git+https://github.com/Alexays/Waybar.git")',
        '',
        'build() {',
        '  arch-meson "waybar" build',
        '  meson compile -C build',
        '}',
        '',
        'package() {',
        '  meson install -C build --destdir "$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Source compiled: Qt/QMake', () => {
    it('ffaudioconverter: qmake6 build', () => {
      const pkgbuild = [
        'pkgname=ffaudioconverter',
        'pkgver=0.32.0',
        'pkgrel=2',
        'arch=("x86_64")',
        'depends=("qt6-base" "qt6-tools" "ffmpeg")',
        'source=("FFaudioConverter-0.32.0-src.tar.xz")',
        '',
        'build() {',
        '  qmake6 PREFIX="${pkgdir}/usr" FFaudioConverter.pro -spec linux-g++ CONFIG+=release',
        '  make',
        '}',
        '',
        'package() {',
        '  make DESTDIR="$pkgdir/usr" install',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Source compiled: Autotools', () => {
    it('logstalgia: autoreconf + configure + make', () => {
      const pkgbuild = [
        'pkgname=logstalgia',
        'pkgver=1.1.5',
        'pkgrel=1',
        'arch=("x86_64")',
        'makedeps=("boost-libs")',
        'depends=("glibc" "sdl2-compat" "sdl2_image" "ftgl" "glew")',
        'source=("logstalgia-1.1.5.tar.gz")',
        '',
        'prepare() {',
        '  cd logstalgia-1.1.5',
        '  autoreconf -fiv',
        '}',
        '',
        'build() {',
        '  cd logstalgia-1.1.5',
        '  ./configure --prefix=/usr',
        '  make',
        '}',
        '',
        'package() {',
        '  cd logstalgia-1.1.5',
        '  make DESTDIR="$pkgdir/" install',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Native builds with Node tooling', () => {
    it('vicinae: cmake build with pnpm for the extension part', () => {
      const pkgbuild = [
        'pkgname=vicinae',
        'arch=("x86_64")',
        'makedepends=("cmake" "git" "pnpm" "nodejs")',
        'source=("git+https://github.com/vicinaehq/vicinae.git")',
        '',
        'build() {',
        '  pnpm install',
        '  cmake -B build -S vicinae',
        '  cmake --build build',
        '}',
        '',
        'package() {',
        '  DESTDIR="$pkgdir" cmake --install build',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });

    it('apollo: gcc build with npm in makedepends for the web UI', () => {
      const pkgbuild = [
        'pkgname=apollo',
        'arch=("x86_64")',
        'makedepends=("npm" "git")',
        'source=("git+https://github.com/ClassicOldSong/Apollo.git")',
        '',
        'build() {',
        '  export CC=gcc',
        '  gcc --version',
        '  npm run build',
        '  make -C build',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });

    it('electron-forge app: `npm run make` is not a native build', () => {
      const pkgbuild = [
        'pkgname=ytmdesktop-git',
        'arch=("x86_64")',
        'makedepends=("npm" "git")',
        'source=("git+https://github.com/ytmdesktop/ytmdesktop.git")',
        '',
        'build() {',
        '  npm install',
        '  npm run make',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('!strip with a native build command', () => {
    it('tclkit: !strip with make on a source tarball', () => {
      const pkgbuild = [
        'pkgname=tclkit',
        'arch=(x86_64)',
        'options=(!strip)',
        'source=("https://example.com/kitgen-8.6.tar.gz")',
        '',
        'build() {',
        '  make -f Makefile.linux',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });
  });

  describe('Python builds', () => {
    it('native extension: setup.py in package() with a native arch', () => {
      const pkgbuild = [
        'pkgname=python-bempp-cl',
        'arch=("x86_64")',
        'makedepends=("python-setuptools")',
        'source=("https://files.pythonhosted.org/packages/source/b/bempp-cl/bempp-cl-0.4.tar.gz")',
        '',
        'package() {',
        '  python setup.py install --root="$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(true);
    });

    it('pure Python: setup.py with arch=(any)', () => {
      const pkgbuild = [
        'pkgname=python-pure',
        'arch=("any")',
        'makedepends=("python-setuptools")',
        'source=("https://example.com/pure-1.0.tar.gz")',
        '',
        'package() {',
        '  python setup.py install --root="$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('Repackaged binaries', () => {
    it('zoom: upstream pkg.tar.xz, no build function', () => {
      const pkgbuild = [
        'pkgname=zoom',
        'arch=("x86_64")',
        'options=(!strip)',
        'source=("zoom-7.1.5_orig_x86_64.pkg.tar.xz::https://zoom.us/client/7.1.5/zoom_x86_64.pkg.tar.xz")',
        '',
        'package() {',
        '  cp -dpr --no-preserve=ownership opt usr "$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });

    it('freedownloadmanager: upstream .deb, no build function', () => {
      const pkgbuild = [
        'pkgname=freedownloadmanager',
        'arch=("x86_64")',
        'source=("https://files2.freedownloadmanager.org/6/latest/freedownloadmanager.deb")',
        '',
        'package() {',
        '  bsdtar -xf data.tar.xz -C "$pkgdir"',
        '}',
      ].join('\n');
      expect(isSourceCompiledPackage(pkgbuild)).toBe(false);
    });
  });

  describe('Boundary conditions', () => {
    it('null', () => {
      expect(isSourceCompiledPackage(null)).toBe(false);
    });

    it('undefined', () => {
      expect(isSourceCompiledPackage(undefined)).toBe(false);
    });

    it('empty string', () => {
      expect(isSourceCompiledPackage('')).toBe(false);
    });
  });
});

describe('classifyPkgbuild', () => {
  it('classifies an electron app via depends', () => {
    const pkgbuild = [
      "pkgname='some-app'",
      "depends=('electron34' 'gtk3')",
      "makedepends=('nodejs' 'npm')",
      'build() {',
      '  npm install',
      '}',
    ].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['electron', 'nodejs']);
  });

  it('classifies rust with version-constrained and quoted deps', () => {
    const pkgbuild = [
      "pkgname='cool-tool'",
      'makedepends=(\'rust\' "cargo>=1.80")',
      'build() {',
      '  cargo build --release',
      '}',
    ].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toContain('rust');
    expect(classifyPkgbuild(pkgbuild)).toContain('compiled');
  });

  it('does not classify font deps as go', () => {
    const pkgbuild = ["pkgname='misc-bundle'", "depends=('go-fonts' 'bash')"].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['shell']);
  });

  it('does not classify a makedepends-only perl toolchain as perl', () => {
    const pkgbuild = ["pkgname='intltool-user'", "makedepends=('perl-xml-parser')", 'build() {', '  make', '}'].join(
      '\n',
    );
    expect(classifyPkgbuild(pkgbuild)).toEqual(['compiled']);
  });

  it('classifies perl via runtime dependency', () => {
    const pkgbuild = ["pkgname='aur-helper'", "depends=('perl' 'git')"].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['perl']);
  });

  it('classifies python via module deps and build commands', () => {
    const pkgbuild = [
      "pkgname='py-tool'",
      "depends=('python' 'python-pyzmq')",
      "makedepends=('python-build' 'python-installer' 'python-wheel')",
      'build() {',
      '  python -m build --wheel --no-isolation',
      '}',
    ].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['python', 'compiled']);
  });

  it('classifies name-based kinds including variable names', () => {
    const pkgbuild = ['_pkgbase="something"', 'pkgname="${_pkgbase}"-bin', "depends=('glibc')"].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['prebuilt']);
  });

  it('classifies dkms packages as kernel modules', () => {
    const pkgbuild = ["pkgname='akvcam-dkms'", "depends=('dkms')"].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['kernel-module']);
  });

  it('classifies extension packages by name', () => {
    const pkgbuild = "pkgname='gnome-shell-extension-tiling-assistant'".split('\n');
    expect(classifyPkgbuild(pkgbuild.join('\n'))).toEqual(['extension']);
  });

  it('classifies dependency-only packages without source as meta', () => {
    const pkgbuild = ["pkgname='keyring-bundle'", "depends=('archlinux-keyring' 'chaotic-keyring')"].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['meta']);
  });

  it('classifies a pure bash script as shell', () => {
    const pkgbuild = [
      "pkgname='ani-cli'",
      "depends=('bash' 'curl')",
      'package() {',
      '  install -Dm755 ani-cli "$pkgdir/usr/bin/ani-cli"',
      '}',
    ].join('\n');
    expect(classifyPkgbuild(pkgbuild)).toEqual(['shell']);
  });

  it('returns empty for null, undefined and empty input', () => {
    expect(classifyPkgbuild(null)).toEqual([]);
    expect(classifyPkgbuild(undefined)).toEqual([]);
    expect(classifyPkgbuild('')).toEqual([]);
  });
});
