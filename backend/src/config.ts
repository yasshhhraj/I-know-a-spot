import { isIP } from 'node:net';

export interface ServerConfig {
  port: number;
  host: string;
  frontendOrigin: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  supabaseServiceRoleKey?: string;
  modelId?: string;
  modelCacheDir?: string;
}

/** Integration settings are optional at startup so /health remains scaffold-only. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawPort = env.PORT ?? '3001';
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }

  const host = env.HOST ?? '127.0.0.1';
  if (host !== 'localhost' && isIP(host) === 0) {
    throw new Error('HOST must be localhost or an IP address');
  }

  const rawOrigin = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error('FRONTEND_ORIGIN must be a single HTTP(S) origin');
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    !origin.hostname ||
    origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash ||
    rawOrigin !== origin.origin
  ) {
    throw new Error('FRONTEND_ORIGIN must be a single HTTP(S) origin');
  }

  return {
    port, host, frontendOrigin: origin.origin,
    ...(env.SUPABASE_URL ? { supabaseUrl: env.SUPABASE_URL } : {}),
    ...(env.SUPABASE_PUBLISHABLE_KEY ? { supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY } : {}),
    ...(env.SUPABASE_SECRET_KEY ? { supabaseSecretKey: env.SUPABASE_SECRET_KEY } : {}),
    ...(env.SUPABASE_SERVICE_ROLE_KEY ? { supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY } : {}),
    modelId: env.MODEL_ID ?? 'Xenova/all-MiniLM-L6-v2',
    modelCacheDir: env.MODEL_CACHE_DIR ?? '.cache/models',
  };
}
