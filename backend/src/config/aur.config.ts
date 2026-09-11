import { registerAs } from '@nestjs/config';

export default registerAs('aur', () => ({
  username: process.env.AUR_USERNAME,
  password: process.env.AUR_PASSWORD,
  mirrorUrl: process.env.AUR_MIRROR_URL ?? 'https://github.com/archlinux/aur.git',
  mirrorPath: process.env.AUR_MIRROR_PATH ?? 'tmp/aur-mirror',
}));
