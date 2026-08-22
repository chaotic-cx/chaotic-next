import { describe, expect, it } from 'vitest';
import { isBinaryPackage } from './pkgbuild-classifier';

describe('isBinaryPackage', () => {
  it('identifies packages with binary suffixes', () => {
    expect(isBinaryPackage('eclipse-java-bin')).toBe(true);
    expect(isBinaryPackage('fiji-bin')).toBe(true);
    expect(isBinaryPackage('insync-appimage')).toBe(true);
    expect(isBinaryPackage('spotify-snap')).toBe(true);
    expect(isBinaryPackage('discord-flatpak')).toBe(true);
    expect(isBinaryPackage('google-cloud-cli-bundled-python3-unix')).toBe(true);
  });

  it('identifies real-world live AUR PKGBUILDs as binary packages', () => {
    const liveAndroidStudio = `
pkgname=android-studio
pkgver=2026.1.3.8
_vername="quail3-patch1"
pkgrel=1
pkgdesc="The official Android IDE (Stable branch)"
arch=('i686' 'x86_64')
options=('!strip')
source=("https://dl.google.com/dl/android/studio/ide-zips/$pkgver/android-studio-$_vername-linux.tar.gz"
        "$pkgname.desktop"
        "license.html")
package() {
  cd $srcdir/$pkgname
  install -d $pkgdir/{opt/$pkgname,usr/bin}
  cp -a bin lib jbr plugins license LICENSE.txt build.txt product-info.json $pkgdir/opt/$pkgname
}
`;
    expect(isBinaryPackage('android-studio', liveAndroidStudio)).toBe(true);

    const liveInsync = `
pkgname=insync
pkgver=3.9.11.60043
pkgrel=1
_dist=noble
arch=('x86_64')
options=(!strip)
source=("http://cdn.insynchq.com/builds/linux/\${pkgver}/\${pkgname}_\${pkgver}-\${_dist}_amd64.deb")
package() {
   tar xf data.tar.gz
   cp -rp usr \${pkgdir}/
}
`;
    expect(isBinaryPackage('insync', liveInsync)).toBe(true);

    const liveEclipseMat = `
pkgname=eclipse-mat
_pgname=MemoryAnalyzer
pkgver=1.16.1
arch=('x86_64' 'aarch64')
source_x86_64=("\${pkgname}-\${pkgver}-x86_64.zip::https://www.eclipse.org/downloads/download.php?file=/mat/\${_pkgver}/rcp/\${_pgname}-\${pkgver}.\${_releasedate}-linux.gtk.x86_64.zip&r=1")
build() {
    cat >"\${srcdir}"/\${pkgname}.desktop <<EOF
[Desktop Entry]
EOF
}
package() {
    install -dm755 "\${pkgdir}"/opt/\${pkgname}
    cp -a "\${srcdir}"/mat/* "\${pkgdir}"/opt/\${pkgname}
}
`;
    expect(isBinaryPackage('eclipse-mat', liveEclipseMat)).toBe(true);

    const liveCassandra = `
pkgname=cassandra
pkgver=5.0.3
arch=('any')
source=(https://archive.apache.org/dist/cassandra/5.0.3/apache-cassandra-5.0.3-bin.tar.gz)
build() {
    cd "$srcdir/apache-cassandra-5.0.3"
}
package() {
    cp -a pylib tools "$pkgdir/usr/share/cassandra/"
}
`;
    expect(isBinaryPackage('cassandra', liveCassandra)).toBe(true);
  });

  it('correctly keeps source-built packages as non-binary', () => {
    const liveKwinEffects = `
pkgname=kwin-effects-better-blur-dx
pkgver=2.5.1
arch=('x86_64')
makedepends=(cmake extra-cmake-modules qt6-tools kwin)
source=("$pkgname-$pkgver.tar.gz::$url/archive/refs/tags/v$pkgver.tar.gz")
build() {
  cmake -B build -S "$pkgname-$pkgver"
  cmake --build build
}
package() {
  DESTDIR="\${pkgdir}" cmake --install build
}
`;
    expect(isBinaryPackage('kwin-effects-better-blur-dx', liveKwinEffects)).toBe(false);
  });
});
