import { browserAuthFixture } from './browser-auth-fixture';

describe('browser auth identity isolation', () => {
  it('is deterministic and distinct from the operational ADMIN', () => {
    const fixture = browserAuthFixture('ci-123-1');
    expect(fixture).toEqual(browserAuthFixture('ci-123-1'));
    expect(fixture.email).toBe('browser-ci-123-1-auth-admin@example.test');
    expect(fixture.email).not.toBe('browser-ci-123-1@example.test');
    expect(fixture.controlNumber).toBe('BROWSER-ci-123-1-AUTH-ADMIN');
  });

  it('uses a different normalized email on the same-database rerun', () => {
    expect(browserAuthFixture('ci-123-1-rerun').email.toLowerCase()).not.toBe(
      browserAuthFixture('ci-123-1').email.toLowerCase(),
    );
  });
});
