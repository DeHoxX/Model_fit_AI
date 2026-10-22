import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../src/lib/api-client';

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps JSON payload on successful 200 response', async () => {
    const mockData = { status: 'live' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await apiClient<{ status: string }>('/api/v1/health/live');
    expect(result).toEqual(mockData);
  });

  it('correctly maps 503 error envelope to ApiError', async () => {
    const errorEnvelope = {
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
        details: {},
        request_id: 'req-test-uuid',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => errorEnvelope,
      headers: new Headers({ 'X-Request-ID': 'req-test-uuid' }),
    });

    await expect(apiClient('/api/v1/health/ready')).rejects.toThrow(ApiError);

    try {
      await apiClient('/api/v1/health/ready');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('DATABASE_UNAVAILABLE');
      expect(apiErr.status).toBe(503);
      expect(apiErr.requestId).toBe('req-test-uuid');
      expect(apiErr.message).toBe('Database readiness check failed');
    }
  });

  it('handles non-JSON error response with fallback status code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('Not JSON');
      },
      headers: new Headers({ 'X-Request-ID': 'req-gateway-123' }),
    });

    try {
      await apiClient('/api/v1/bad-gateway');
      expect.fail('Should have thrown');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.code).toBe('HTTP_502');
      expect(apiErr.requestId).toBe('req-gateway-123');
    }
  });
});
