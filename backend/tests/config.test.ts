import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('server configuration', () => {
  it('uses local-only defaults and allows explicit network settings', () => {
    expect(readConfig({})).toEqual({
      port: 3001,
      host: '127.0.0.1',
      frontendOrigin: 'http://localhost:5173',
      modelId: 'Xenova/all-MiniLM-L6-v2',
      modelCacheDir: '.cache/models',
    });
    expect(readConfig({ PORT: '8080', HOST: '0.0.0.0', FRONTEND_ORIGIN: 'https://example.org' }))
      .toEqual({ port: 8080, host: '0.0.0.0', frontendOrigin: 'https://example.org', modelId: 'Xenova/all-MiniLM-L6-v2', modelCacheDir: '.cache/models' });
    expect(readConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'unused' }))
      .toMatchObject({ supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_test' });
  });

  it('accepts explicit model settings without accidentally enabling arbitrary model IDs in the local loader', () => {
    expect(readConfig({ MODEL_ID: 'other', MODEL_CACHE_DIR: '/tmp/model-cache' }))
      .toMatchObject({ modelId: 'other', modelCacheDir: '/tmp/model-cache' });
  });

  it.each(['0', '65536', '3.5', '-1', '', '3001junk'])('rejects invalid port %j', (PORT) => {
    expect(() => readConfig({ PORT })).toThrow('PORT must be an integer');
  });

  it('rejects malformed host and origin without echoing input', () => {
    expect(() => readConfig({ HOST: 'invalid host secret' })).toThrow('HOST must be localhost or an IP address');
    expect(() => readConfig({ FRONTEND_ORIGIN: 'https://secret@example.org/path' }))
      .toThrow('FRONTEND_ORIGIN must be a single HTTP(S) origin');
    expect(() => readConfig({ FRONTEND_ORIGIN: 'https://example.org,https://other.org' }))
      .toThrow('FRONTEND_ORIGIN must be a single HTTP(S) origin');
  });
});
