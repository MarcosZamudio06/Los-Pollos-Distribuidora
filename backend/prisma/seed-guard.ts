export function assertSeedEnvironment(nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === 'production') {
    throw new Error(
      'Development and operational seeds are disabled when NODE_ENV=production',
    );
  }
}
