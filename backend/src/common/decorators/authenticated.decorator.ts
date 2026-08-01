import { SetMetadata } from '@nestjs/common';

export const IS_AUTHENTICATED_KEY = 'access:is-authenticated';

export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);
