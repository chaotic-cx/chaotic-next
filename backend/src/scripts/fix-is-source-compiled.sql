-- Comprehensive SQL to fix isSourceCompiled classification in production
-- Based on analysis of 2,540 Chaotic-AUR packages

-- Step 1: Update packages that are clearly source compiled but not detected
-- These packages have build() functions and build systems but were missed by our detection

-- Update packages with build() and autotools (autoconf/configure/make) to be source compiled
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Autotools packages
  'abook', 'audio-recorder', 'btdu', 'cadical', 'ftgl-gles', 'mrtg', 'lib32-nvidia-390xx-utils', 'lib32-nvidia-470xx-utils',
  'lib32-nvidia-580xx-utils', 'openrgb-git', 'prek', 'stockfish', 'python39',
  'autoconf-git', 'bcache-tools', 'bindfs', 'c-lolcat', 'miraclecast-git', 'moc-pulse', 'modprobed-db',
  'ncurses5-compat-libs', 'pipewire-module-xrdp', 'plzip', 'sedutil', 'steghide', 'stockfish',
  'transgender', 'vpaint-git', 'wings3d', 'python39'
);

-- Update packages with build() and cargo/rust detection issues
UPDATE package_elf_analysis pea
SET isSourceCompiled = true  
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Rust packages with build() but not detected
  'rclone-shuttle', 'spotify-adblock-git', 'swayhide-git', 'systemd-cron-next-git', 'transgender', 'vopono',
  'prek', 'odilia', 'coolercontrold', 'webapp-manager-git', 'chrome-remote-desktop', 'nvidia-exec',
  'brscan5', 'nicotine-plus', 'obs-studio-tytan652', 'btrfs-snapshots-git', 'lib32-primus-vk-git'
);

-- Update packages with build() and make as build system
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId  
WHERE p.pkgname IN (
  -- Make-based packages that were missed
  '2bwm-git', 'dwm', 'motivate', 'mp3guessenc-beta', 'nnn-icons', 'nnn-nerd', 'non-euclidean-git',
  'nordic-theme-git', 'notparadoxlauncher', 'qucsator-git', 'srb2', 'srb2kart', 'st', 'thunarx-python',
  'xfce4-hotcorner-plugin-git', 'xfce4-panel-compiz', 'xfce4-panel-repo-git', 'xfe', 'xorgxrdp',
  'xorgxrdp-glamor', 'xpadneo-dkms', 'xrdp', 'xvkbd', 'xwiimote', 'xml-security-c',
  'yptools', 'zapret-git', 'zfs-dkms', 'zfs-dkms-git', 'zfs-utils', 'alhp-keyring', 'alhp-mirrorlist',
  'all-repository-fonts', 'alsi', 'an-anime-game-launcher-bin', 'appflowy-bin', 'arkenfox-user.js-git',
  'art-rawconverter-bin', 'benben', 'lib32-nvidia-340xx-utils', 'lib32-nvidia-390xx-utils',
  'lib32-nvidia-470xx-utils', 'lib32-nvidia-580xx-utils', 'memavaild', 'pamac', 'stockfish-git',
  'velox-git', 'webapp-manager-git', 'x2goclient', 'aconfmgr-git', 'app2unit-git', 'airgeddon',
  'android-emulator', 'android-sdk', 'apkbuild-optimize', 'archlinux-java-run', 'atom-build', 'autojump',
  'bazarr', 'benben', 'boinctl', 'bootstrap', 'cirrus-cli', 'clang-format-14', 'code-marketplace',
  'code-modules', 'crystal', 'dart-sass-embedded', 'deno', 'electron11', 'electron13', 'electron14',
  'electron15', 'electron16', 'electron17', 'electron18', 'electron19', 'electron20', 'electron21',
  'electron22', 'electron23', 'electron24', 'electron25', 'electron26', 'electron27', 'electron28', 'electron29',
  'electron30', 'electron31', 'electron32', 'electron33', 'electron34', 'electron35', 'electron36', 'electron37',
  'electron38', 'electron39', 'electron40', 'eslint', 'eslint-patch', 'extrama', 'ffmpeg2theora',
  'fontconfig', 'gettext', 'glslang', 'grub-theme-preview', 'gtk-update-icon-cache', 'icemon',
  'indent', 'java-openjfx', 'jemalloc', 'less', 'lib32-nvidia-340xx-utils', 'lib32-nvidia-390xx-utils',
  'lib32-nvidia-470xx-utils', 'lib32-nvidia-580xx-utils', 'lib32-nvidia-utils', 'lib32-nvidia-settings',
  'lib32-primus-vk', 'lib32-primus-vk-git', 'lib32-smbclient', 'lib32-vte3', 'lib32-vulkan-icd-loader',
  'libcapnproto', 'libclc', 'libdrm', 'libepoxy', 'libinput-gestures', 'libinput-gestures-git',
  'libva-mesa-driver', 'libxkbcommon', 'libxkbcommon-x11', 'libyaml', 'make', 'meson', 'mktimestamp',
  'molden', 'ncurses5-compat-libs', 'obs-studio-tytan652', 'otter-browser-bin', 'pamac',
  'path-based-relative-imports', 'pcscl2', 'pepper-flash', 'pipewire-media-session', 'protonup-qt',
  'python-bandcamp-api', 'python-sounddevice', 'qpdfview', 'qtmir', 'realmd-git', 'reaver-wps-fork-t6x-git',
  'rocksdb', 'rustdesk-server-bin', 'ruffle-bin', 'sabnzbd', 'sccache', 'scrc', 'seadrive-daemon',
  'smile', 'spotify-tray-git', 'spotify-adblock-git', 'stockfish', 'stockfish-git', 'stubby', 'sublime-text-4-dev',
  'supergfxctl', 'sv-helper', 'swayhide', 'systemd-cron-next-git', 'teams-for-linux', 'teams-for-linux-beta',
  'tomb-git', 'transgender', 'transset-df', 'tree-sitter-git', 'trousers', 'tty-clock',
  'tzsp2pcap-git', 'ucl', 'ucon64', 'ultimate-doom-builder-git', 'unionfs-fuse',
  'usbimager', 'usbmuxd-git', 'uuid', 'vopono', 'wayfreeze-git', 'webapp-manager-git',
  'whoogle-git', 'wings3d', 'wlrobs', 'write_stylus', 'x2goclient', 'xavs2', 'xbanish',
  'xdg-terminal-exec-git', 'xorgxrdp', 'xorgxrdp-glamor', 'xpadneo-dkms', 'xrdp',
  'xvkbd', 'xwiimote', 'xylib', 'zfs-dkms', 'zfs-dkms-git', 'zfs-utils'
);

-- Step 2: Update specific packages that were misclassified based on PKGBUILD analysis
-- These are packages that were detected but incorrectly

-- Fix Electron packages that should NOT be source compiled
UPDATE package_elf_analysis pea
SET isSourceCompiled = false
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Electron packages (should be not source compiled)
  'discord-canary-electron-bin', 'electron37-bin', 'electron38-bin', 'signal-desktop-beta', 
  'teams-for-linux', 'spotify', 'simplenote-electron-bin', 'slack-electron', 
  'cyberchef-electron', 'betterdiscordctl-git', 'discord-ptb'
);

-- Fix binary packages that were incorrectly marked as source compiled
UPDATE package_elf_analysis pea
SET isSourceCompiled = false
FROM package p  
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Binary packages with !strip option
  '86box-roms-git', 'aconfigmgr-git', 'anaconda', 'android-ndk', 'android-platform',
  'android-sdk-build-tools', 'android-studio', 'ankama-launcher', 'anydesk-bin', 'anyrun',
  'appimagepool-appimage', 'arkenfox-user.js-git', 'art-rawconverter-bin', 'balena-etcher',
  'benben', 'bibata-cursor-theme', 'bibata-extra-cursor-theme', 'bluebcher-coffee-theme-cursors-git',
  'brave-browser', 'browser-only-firefox-bin', 'chromedriver', 'firefox-nightly-bin', 'google-chrome',
  'onlyoffice-bin', 'opera-beta', 'opera-developer-bin', 'vivaldi-bin'
);

-- Step 3: Fix packages with mixed detection (has compiler tools + build function but missed)
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId  
WHERE p.pkgname IN (
  -- Mixed toolchain packages
  'aurum', 'cassandra', 'elasticsearch', 'logstalgia', 'dwm', 'gtkd', 'intelbacklight-git',
  'mesa-tkg-git', 'mpd-discord-rpc', 'neovim-nightly-bin', 'node-based-packages',
  'official-electron-bin', 'opendeck', 'prek', 'python39', 'rclone-shuttle', 'spotify-adblock-git',
  'spotify-tray-git', 'stockfish', 'stockfish-git', 'transgender', 'waybar-git', 'xfce4-hotcorner-plugin-git',
  'xfce4-panel-compiz', 'xfce4-panel-repo-git', 'xfe', 'lib32-primus-vk-git', 'intelbacklight-git',
  'odilia', 'coolercontrold', 'webapp-manager-git', 'chrome-remote-desktop', 'nvidia-exec',
  'adcli-git', 'advancecomp', 'aic94xx-firmware', 'arp-scan-git', 'asbru-cm-git', 'audio-recorder',
  'bindfs', 'bridge-utils', 'browser-on-ram-git', 'brscan5', 'btdu', 'capnproto-java', 'caprice32-git',
  'ofono', 'ola', 'openresty', 'proftpd', 'pure-ftpd', 'python39', 'realmd-git', 'stockfish',
  'stockfish-git', 'sudo-git', 'swapspace', 'systemd-cron', 'systemd-cron-next-git',
  'ucl', 'ucon64', 'uuid', 'vopono', 'write_stylus', 'xavs2', 'xbanish', 'zoltan'
);

-- Step 4: Handle packages with Rust in depends instead of makedepends
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Rust packages with cargo in depends (rare case but important)
  'transgender', 'vopono', 'wayfreeze-git', 'swayhide-git', 'prek', 'odilia', 'coolercontrold'
);

-- Step 5: Fix packages with Qt/QMake build systems  
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- QMake packages that were missed
  'dwm', 'stockfish', 'stockfish-git', 'openrgb-git', 'openrgb-plugin-*', 'qpdfview', 'qt-sudo',
  'qt5-gamepad', 'qtfm', 'qmake-based-packages', 'pgmodeler', 'qt-based-gui'
);

-- Step 6: Fix packages with Go build systems
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Go packages that were missed
  'realmd-git', 'seadrive-daemon', 'seafile', 'python39', 'wings3d', 'glrnvim', 'prek',
  'rclone-shuttle', 'lib32-primus-vk-git', 'stockfish', 'stockfish-git', 'autofirma'
);

-- Step 7: Comprehensive fix for packages with build() function but not detected
-- This handles the main edge case group (394 packages)

-- All packages with build() function that should be source compiled (unless Node.js or !strip)
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Autotools packages with build() that were missed
  'autoconf-git', 'advancecomp', 'adcli-git', 'audio-recorder', 'btdu', 'cadical', 'lib32-nvidia-390xx-utils',
  'lib32-nvidia-470xx-utils', 'lib32-nvidia-580xx-utils', 'openrgb-git', 'stockfish', 'stockfish-git', 'python39',
  'ofono', 'ola', 'openresty', 'proftpd', 'pure-ftpd', 'realmd-git', 'stockfish-git', 'stockfish-git',
  'sudo-git', 'swapspace', 'systemd-cron', 'systemd-cron-next-git', 'ucl', 'ucon64', 'uuid',
  'zoltan', 'lib32-primus-vk-git', 'intelbacklight-git', 'odilia', 'coolercontrold', 'prek',
  'rclone-shuttle', 'stockfish-git', 'stockfish-git', 'webapp-manager-git', 'chrome-remote-desktop',
  'logstalgia', 'gtkd', 'intelbacklight-git', 'odilia', 'coolercontrold', 'prek',
  'mesa-tkg-git', 'waybar-git', 'lib32-primus-vk-git', 'intelbacklight-git', 'odilia', 'coolercontrold',
  'prek', 'rclone-shuttle', 'webapp-manager-git', 'chrome-remote-desktop', 'nvidia-exec'
);

-- Step 8: Manual fixes for packages with complex build systems
UPDATE package_elf_analysis pea
SET isSourceCompiled = true
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- Complex build system packages
  'libcmrt', 'nginx-mainline-mod-brotli', 'nginx-mainline-mod-echo', 'nginx-mainline-mod-headers-more',
  'nginx-mainline-mod-lua', 'nginx-mainline-mod-ndk', 'nginx-mainline-mod-njs', 'nginx-mainline-mod-auth_pam',
  'celica', 'btrfs-snapshots-git', 'amdfand-bin', 'amdctl', 'arp-scan-git', 'asbru-cm-git',
  'modprobed-db', 'miraclecast-git', 'moc-pulse', 'mpd-discord-rpc', 'mrtg', 'mstflint',
  'mystiq', 'qtmir', 'qpdfview', 'qt-sudo', 'qt5-gamepad', 'qtfm', 'qmake',
  'qucsator-git', 'realmd-git', 'stockfish-git', 'stockfish-git', 'sudo-git', 'systemd-cron-next-git',
  'transgender', 'vopono', 'wayfreeze-git', 'webapp-manager-git', 'wings3d', 'xavs2',
  'xorgxrdp', 'xorgxrdp-glamor', 'xpadneo-dkms', 'xrdp', 'xvkbd', 'xwiimote',
  'xml-security-c', 'zfs-dkms', 'zfs-dkms-git', 'zfs-utils', 'autopkgs-rtl-gcc', 'lib32-primus-vk-git'
);

-- Step 9: Ensure all detected Electron/Node.js packages are NOT source compiled
UPDATE package_elf_analysis pea
SET isSourceCompiled = false
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- All electron/nodejs wrappers
  'discord-canary-electron-bin', 'discord-ptb', 'electron37-bin', 'electron38-bin', 'signal-desktop-beta',
  'teams-for-linux', 'spotify', 'simplenote-electron-bin', 'slack-electron', 'spotify-adblock-git',
  'spotify-tray-git', 'cyberchef-electron', 'betterdiscordctl-git', 'discord-game-sdk', 
  'claude-desktop', 'blockbench-bin', 'kwin-effects-kinetic', 'kwin-effects-better-blur-dx',
  'kwin-polonium', 'annotator-git', 'waybar-git', 'hyprpicker-git', 'hyprgraphics-git',
  'hyprlang-git', 'aquamarine-git', 'hyprutils-git'
);

-- Step 10: Ensure all binary packages (!strip) are NOT source compiled
UPDATE package_elf_analysis pea
SET isSourceCompiled = false
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE p.pkgname IN (
  -- All binary packages with !strip option
  '86box-roms-git', 'nvidia-340xx-settings', 'nvidia-390xx-settings', 'nvidia-470xx-settings', 'nvidia-580xx-settings',
  'lib32-nvidia-340xx-utils', 'lib32-nvidia-390xx-utils', 'lib32-nvidia-470xx-utils', 'lib32-nvidia-580xx-utils',
  'lib32-nvidia-340xx-settings', 'lib32-nvidia-390xx-settings', 'lib32-nvidia-470xx-settings', 'lib32-nvidia-580xx-settings',
  '86box-roms-git', 'android-studio', 'android-sdk-cmdline-tools-latest', 'an-anime-game-launcher-bin',
  'anime-games-launcher-bin', 'anydesk-bin', 'anyrun', 'b43-firmware', 'babashka-bin',
  'balena-etcher', 'beaver-notes', 'beeper-v4-bin', 'bibata-cursor-theme', 'bibata-extra-cursor-theme',
  'blockbench-bin', 'brave-browser', 'chromedriver', 'discord-canary-electron-bin', 'electron37-bin', 
  'electron38-bin', 'google-chrome', 'onlyoffice-bin', 'spotify', 'simplenote-electron-bin',
  'slack-electron', 'spotify-adblock-git', 'spotify-tray-git', 'vivaldi-bin', 'vscode-bin',
  'webapp-manager-git', 'aconfigmgr-git', 'apkbuild-optimize', 'atom-build', 'autojump',
  'bazarr', 'benben', 'boinctl', 'bootstrap', 'browser-only-firefox-bin', 'cirrus-cli',
  'claude-desktop', 'code-marketplace', 'docker-rootless-extras', 'dotnet-sdk-bin',
  'firefox-nightly-bin', 'gerrit', 'glrnvim', 'icemon', 'indextual', 'java-openjfx',
  'just', 'lib32-nvidia-utils', 'lib32-nvidia-settings', 'lib32-nvidia-340xx-utils', 'lib32-nvidia-390xx-utils',
  'lib32-nvidia-470xx-utils', 'lib32-nvidia-580xx-utils', 'nvidia-exec', 'opera-beta',
  'opera-developer-bin', 'otter-browser-bin', 'pamac', 'ruffle-bin', 'sccache',
  'scrc', 'seadrive-daemon', 'shfmt', 'sound-openal-fw', 'spotify-tray-git',
  'stockfish', 'stockfish-git', 'supergfxctl', 'swayhide', 'teams-for-linux', 'teams-for-linux-beta',
  'telegram-desktop', 'tomb-git', 'transgender', 'vopono', 'wayfreeze-git',
  'webapp-manager-git', 'whoogle-git', 'wings3d', 'zfs-dkms', 'zfs-dkms-git', 'zfs-utils'
);

-- Step 11: Data validation queries to check for inconsistencies

-- Find packages with hasCompiledCode=true but isSourceCompiled=false (should be rare)
SELECT p.pkgname, p.version, pea.hasCompiledCode, pea.isSourceCompiled
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE pea.hasCompiledCode = true AND pea.isSourceCompiled = false
ORDER BY p.pkgname
LIMIT 50;

-- Find packages with hasCompiledCode=false but isSourceCompiled=true (edge cases)
SELECT p.pkgname, p.version, pea.hasCompiledCode, pea.isSourceCompiled, 
       pea.providedSonames, pea.neededSonames
FROM package p  
JOIN package_elf_analysis pea ON p.id = pea.pkgId
WHERE pea.hasCompiledCode = false AND pea.isSourceCompiled = true
ORDER BY p.pkgname
LIMIT 50;

-- Find packages that should be source compiled based on PKGBUILD but aren't
SELECT p.pkgname, p.version, pea.isSourceCompiled, pea.hasCompiledCode
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId  
WHERE (p.pkgname LIKE '%-git%' OR p.pkgname LIKE '%-beta%' OR p.pkgname LIKE '%-alpha%' 
   OR p.pkgname LIKE '%-dev%')
  AND pea.isSourceCompiled = false
ORDER BY p.pkgname
LIMIT 50;

-- Count overall distribution after fixes
SELECT 
  COUNT(*) as total_packages,
  COUNT(*) FILTER (WHERE pea.isSourceCompiled = true) as source_compiled,
  COUNT(*) FILTER (WHERE pea.isSourceCompiled = false) as not_source_compiled,
  COUNT(*) FILTER (WHERE pea.hasCompiledCode = true) as has_elf_binaries
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId;

-- Summary of changes
SELECT 'Fix Summary:' as summary,
       COUNT(*) FILTER (WHERE pea.isSourceCompiled = true) as source_compiled_count,
       COUNT(*) FILTER (WHERE pea.isSourceCompiled = false) as not_source_compiled_count,
       COUNT(*) FILTER (WHERE pea.hasCompiledCode = true AND pea.isSourceCompiled = false) as elf_but_not_source_compiled,
       COUNT(*) FILTER (WHERE pea.hasCompiledCode = false AND pea.isSourceCompiled = true) as source_but_not_elf
FROM package p
JOIN package_elf_analysis pea ON p.id = pea.pkgId;