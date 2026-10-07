import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('scaffold health endpoint', () => {
  it('reports scaffold status without claiming live integrations', async () => {
    app = createApp(readConfig({}));
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'scaffold' });
  });

  it('allows the configured frontend origin, not an unrelated one', async () => {
    app = createApp(readConfig({ FRONTEND_ORIGIN: 'http://localhost:5173' }));
    const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } });
    const other = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://elsewhere.test' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).not.toBe('http://elsewhere.test');
  });
});
