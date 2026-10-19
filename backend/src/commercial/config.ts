import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { isEmail } from 'class-validator';

export type LeadConfig = ReturnType<typeof loadLeadConfig>;
export function loadLeadConfig(env: NodeJS.ProcessEnv = process.env) {
  const local = env.LEAD_MODE === 'local';
  const provider = env.LEAD_PROVIDER;
  const url = (value: string | undefined) => {
    const u = new URL(value || '');
    if (
      u.username ||
      u.password ||
      u.hash ||
      (u.protocol !== 'https:' &&
        !(
          local &&
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname)
        ))
    )
      throw new Error('Invalid commercial URL');
    return u;
  };
  const origins = (env.LEAD_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!origins.length || origins.some((v) => url(v).origin !== v))
    throw new Error('Explicit landing origins required');
  const privacyUrl = url(env.LEAD_PRIVACY_URL).href;
  const privacyVersion = env.LEAD_PRIVACY_VERSION || '';
  if (
    env.LEAD_PRIVACY_APPROVED !== 'true' ||
    !/^[a-zA-Z0-9._-]{1,80}$/.test(privacyVersion)
  )
    throw new Error('Approved versioned privacy notice required');
  if (provider !== 'resend' && !(local && provider === 'capture'))
    throw new Error('Configured notification provider required');
  const from = env.LEAD_MAIL_FROM || '';
  const to = env.LEAD_MAIL_TO || '';
  if (
    provider === 'resend' &&
    (!isEmail(from) || !isEmail(to) || !env.LEAD_RESEND_API_KEY)
  )
    throw new Error('Server mail configuration required');
  const dbPath = env.LEAD_DB_PATH || '';
  if (!isAbsolute(dbPath) || dbPath === ':memory:')
    throw new Error('Absolute persistent commercial database path required');
  const rateSecret = env.LEAD_RATE_SECRET || '';
  if (rateSecret.length < 32)
    throw new Error('Rate hash secret must have at least 32 characters');
  const port = Number(env.LEAD_PORT || 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid receiver port');
  const trustedProxies = (env.LEAD_TRUST_PROXY_IPS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (trustedProxies.some((value) => !isIP(value)))
    throw new Error('Trusted proxies must be explicit IP addresses');
  return {
    trustedProxies,
    local,
    provider,
    origins,
    privacyUrl,
    privacyVersion,
    from,
    to,
    dbPath,
    rateSecret,
    port,
    apiKey: env.LEAD_RESEND_API_KEY || '',
  };
}
