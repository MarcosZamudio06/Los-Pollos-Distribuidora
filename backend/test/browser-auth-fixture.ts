export function browserAuthFixture(runId: string) {
  return {
    email: `browser-${runId}-auth-admin@example.test`,
    name: `Browser E2E ${runId} auth admin`,
    controlNumber: `BROWSER-${runId}-AUTH-ADMIN`,
  };
}
