import { SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

export type RateLimitPolicyName = 'login' | 'refresh' | 'fleet-position';
const RATE_LIMIT_POLICY = 'http-rate-limit-policy';

export const RateLimitPolicy = (policy: RateLimitPolicyName) =>
  SetMetadata(RATE_LIMIT_POLICY, policy);

export function hasRateLimitPolicy(
  context: ExecutionContext,
  policy: RateLimitPolicyName,
): boolean {
  return (
    Reflect.getMetadata(RATE_LIMIT_POLICY, context.getHandler()) === policy
  );
}
