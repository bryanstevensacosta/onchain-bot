import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'aiMlIsPublic';

/** Mark a route as public (health): the API-key guard always passes. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
