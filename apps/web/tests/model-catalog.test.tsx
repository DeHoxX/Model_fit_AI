import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ModelCatalogPage from '../src/app/models/page';
import * as apiClientModule from '../src/lib/api-client';

describe('ModelCatalogPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders search input and sort filters', async () => {
    vi.spyOn(apiClientModule, 'apiClient').mockResolvedValueOnce({
      items: [
        {
          id: 'meta-llama/Meta-Llama-3-8B',
          author: 'meta-llama',
          model_name: 'Meta-Llama-3-8B',
          pipeline_tag: 'text-generation',
          likes: 8450,
          downloads: 1250000,
          is_supported: true,
          support_status: 'supported_llm',
          gated: false,
          license: 'llama3',
          total_params: 8030000000,
        },
      ],
      next_cursor: null,
      has_more: false,
    });

    render(<ModelCatalogPage />);

    expect(screen.getByText(/Model Catalog/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Search by repo name/i)).toBeDefined();
    expect(screen.getByText('Downloads')).toBeDefined();
    expect(screen.getByText('Likes')).toBeDefined();
    expect(screen.getByText('Recent')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Meta-Llama-3-8B')).toBeDefined();
      expect(screen.getByText('meta-llama')).toBeDefined();
      expect(screen.getByText('Supported')).toBeDefined();
      // Verify Ask in chat button
      const askBtn = screen.getByRole('link', { name: /Ask in chat/i });
      expect(askBtn).toBeDefined();
      expect(askBtn.getAttribute('href')).toBe('/chat?repo_id=meta-llama%2FMeta-Llama-3-8B');
    });

    // Verify model-type filter dropdown
    const select = screen.getByLabelText(/Task/i) as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(screen.getByRole('option', { name: 'Text generation' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Text to speech' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Speech recognition' })).toBeDefined();
  });

  it('renders empty state when no models match search', async () => {
    vi.spyOn(apiClientModule, 'apiClient').mockResolvedValueOnce({
      items: [],
      next_cursor: null,
      has_more: false,
    });

    render(<ModelCatalogPage />);

    await waitFor(() => {
      expect(screen.getByText(/No models found/i)).toBeDefined();
    });
  });
});
