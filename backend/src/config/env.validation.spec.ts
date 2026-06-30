import { DEFAULT_DATABASE_URL } from './database.config';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('uses the repo default DATABASE_URL when none is provided', () => {
    expect(
      validateEnvironment({
        API_PREFIX: 'api',
        DATABASE_SSL: 'false',
        PORT: '4000',
        SWAGGER_PATH: 'docs',
      }),
    ).toEqual(
      expect.objectContaining({
        DATABASE_URL: DEFAULT_DATABASE_URL,
      }),
    );
  });
});
