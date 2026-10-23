import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseSSEChunk } from '../src/lib/useChatStream';
import { RecommendationCardView } from '../src/components/chat/RecommendationCardView';
import { RecommendationCandidate } from '../src/types/chat';

describe('Chat SSE Streaming & Card Components', () => {
  it('parses multi-event SSE chunks and maintains incomplete buffer', () => {
    const rawChunk1 =
      'event: token\ndata: {"text": "Hello"}\n\nevent: tool_call\ndata: {"name": "search_models", "status": "running"}\n\nevent: token\ndata: {"text": " world';
    const { events: events1, remainingBuffer: buf1 } = parseSSEChunk(rawChunk1, '');

    expect(events1).toHaveLength(2);
    expect(events1[0]).toEqual({ event: 'token', data: { text: 'Hello' } });
    expect(events1[1]).toEqual({
      event: 'tool_call',
      data: { name: 'search_models', status: 'running' },
    });
    expect(buf1).toContain('event: token\ndata: {"text": " world');

    // Complete the second chunk
    const rawChunk2 = '"}\n\n';
    const { events: events2, remainingBuffer: buf2 } = parseSSEChunk(rawChunk2, buf1);

    expect(events2).toHaveLength(1);
    expect(events2[0]).toEqual({ event: 'token', data: { text: ' world' } });
    expect(buf2).toBe('');
  });

  it('renders RecommendationCardView with deterministic memory numbers and estimator link', () => {
    const mockCandidate: RecommendationCandidate = {
      model_id: 'Qwen/Qwen2.5-Coder-7B-Instruct',
      model_name: 'Qwen2.5-Coder-7B-Instruct',
      author: 'Qwen',
      pipeline_tag: 'text-generation',
      license: 'apache-2.0',
      estimate: {
        weights_bytes: 4660151910,
        kv_cache_bytes: 469762048,
        activation_bytes: 192937984,
        runtime_overhead_bytes: 268435456,
        total_bytes: 5591287398,
        per_device_bytes: null,
        verdict: 'fits',
        headroom_bytes: 6649369396,
        assumptions: [],
        warnings: [],
        unsupported_reasons: [],
        confidence: 'high',
      },
      verdict: 'fits',
      warnings: [],
      assumptions: [],
      scoring: {
        headroom_score: 0.892,
        downloads_score: 0.881,
        recency_score: 0.5,
        license_score: 1.0,
        total_score: 0.8466,
      },
      rank_reasons: [
        'Headroom: 6.2 GiB (89% score)',
        'Popularity: 1,469,810 downloads',
        'License: apache-2.0',
      ],
    };

    render(<RecommendationCardView candidate={mockCandidate} />);

    // Assert card content is present and deterministic
    expect(screen.getByText('Qwen2.5-Coder-7B-Instruct')).toBeDefined();
    expect(screen.getByText('Fits Comfortably')).toBeDefined();
    expect(screen.getByText(/5.2 GiB required/)).toBeDefined();
    expect(screen.getByText(/6.2 GiB free headroom/)).toBeDefined();

    // Assert model details link points directly to /models/...
    const link = screen.getByRole('link', { name: /View Model Details/i });
    expect(link.getAttribute('href')).toBe('/models/Qwen/Qwen2.5-Coder-7B-Instruct');
  });
});
