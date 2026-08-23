import { registerAs } from '@nestjs/config';

export default registerAs('aur', () => ({
  username: process.env.AUR_USERNAME,
  password: process.env.AUR_PASSWORD,
}));
