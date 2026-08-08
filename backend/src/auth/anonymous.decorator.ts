import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANONYMOUS_META_KEY = 'allowAnonymous';
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS_META_KEY, true);
