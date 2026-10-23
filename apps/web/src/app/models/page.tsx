'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Download,
  Heart,
  Layers,
  ShieldAlert,
  ArrowRight,
  Filter,
  RefreshCw,
  Compass,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { paths } from '@/api/schema';

type ModelSummary =
  paths['/api/v1/models']['get']['responses']['200']['content']['application/json']['items'][number];

type SortOption = 'downloads' | 'likes' | 'recent';

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toString();
}

function formatParams(num?: number | null): string | null {
  if (!num) return null;
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B params';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(0) + 'M params';
  }
  return num.toLocaleString() + ' params';
}

export default function ModelCatalogPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('downloads');
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(
    async (cursor?: string | null, append = false) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const queryParams = new URLSearchParams();
        if (search.trim()) queryParams.set('search', search.trim());
        queryParams.set('sort', sort);
        queryParams.set('limit', '24');
        if (cursor) queryParams.set('cursor', cursor);

        const data = await apiClient<
          paths['/api/v1/models']['get']['responses']['200']['content']['application/json']
        >(`/api/v1/models?${queryParams.toString()}`);

        if (append) {
          setModels(prev => [...prev, ...data.items]);
        } else {
          setModels(data.items);
        }
        setNextCursor(data.next_cursor || null);
        setHasMore(data.has_more);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Failed to fetch models from Hugging Face Hub.';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [search, sort]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchModels();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchModels]);

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      fetchModels(nextCursor, true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1211] text-[#e4ece7]">
      {/* Top Header */}
      <header className="border-b border-[#1d2622] bg-[#111714]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1c2923] border border-[#2d4237] flex items-center justify-center text-[#75a691] shadow-inner">
              <Compass size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#e4ece7] flex items-center gap-2">
                Model Catalog
                <span className="text-[10px] font-mono uppercase bg-[#18231e] text-[#75a691] border border-[#2b3d33] px-2 py-0.5 rounded-full">
                  Hugging Face Hub
                </span>
              </h1>
              <p className="text-xs text-[#708479]">
                Discover transformer architectures, verified safetensors headers, and memory footprints.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/estimator"
              className="text-xs font-medium text-[#75a691] hover:text-[#a0c5b3] bg-[#16211c] hover:bg-[#1d2d26] border border-[#2a3c33] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span>Custom Estimator</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search & Filter Toolbar */}
        <div className="bg-[#131b17] border border-[#202c26] rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          {/* Search Box */}
          <div className="relative w-full sm:w-96 flex items-center">
            <Search size={15} className="absolute left-3 text-[#52635a]" />
            <input
              type="text"
              id="model-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by repo name or author (e.g. meta-llama, mistral)..."
              className="w-full bg-[#0d1210] border border-[#24332c] rounded-lg pl-9 pr-3 py-2 text-xs text-[#e4ece7] placeholder-[#52635a] focus:outline-none focus:border-[#405c4d] transition-colors"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Filter size={14} className="text-[#617369]" />
            <span className="text-xs text-[#708479] font-medium">Sort by:</span>
            <div className="flex items-center bg-[#0d1210] border border-[#24332c] rounded-lg p-0.5 text-xs">
              <button
                type="button"
                id="sort-downloads"
                onClick={() => setSort('downloads')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  sort === 'downloads'
                    ? 'bg-[#22332a] text-[#a0c5b3] border border-[#3b5246]'
                    : 'text-[#708479] hover:text-[#e4ece7]'
                }`}
              >
                Downloads
              </button>
              <button
                type="button"
                id="sort-likes"
                onClick={() => setSort('likes')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  sort === 'likes'
                    ? 'bg-[#22332a] text-[#a0c5b3] border border-[#3b5246]'
                    : 'text-[#708479] hover:text-[#e4ece7]'
                }`}
              >
                Likes
              </button>
              <button
                type="button"
                id="sort-recent"
                onClick={() => setSort('recent')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  sort === 'recent'
                    ? 'bg-[#22332a] text-[#a0c5b3] border border-[#3b5246]'
                    : 'text-[#708479] hover:text-[#e4ece7]'
                }`}
              >
                Recent
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-[#291717] border border-[#522b2b] text-[#fca5a5] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={16} className="text-[#ef4444] shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchModels()}
              className="px-2.5 py-1 bg-[#3b2020] hover:bg-[#4d2929] rounded text-[11px] font-medium text-[#fca5a5] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Model Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-xl bg-[#121915] border border-[#1e2823] animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="h-4 bg-[#1b2620] rounded w-3/4" />
                  <div className="h-3 bg-[#17211c] rounded w-1/2" />
                </div>
                <div className="h-3 bg-[#17211c] rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-16 bg-[#111714] border border-[#1d2622] rounded-2xl p-8 space-y-3">
            <Compass size={32} className="mx-auto text-[#43574c]" />
            <h3 className="text-sm font-semibold text-[#e4ece7]">No models found</h3>
            <p className="text-xs text-[#708479] max-w-sm mx-auto">
              No repositories matched your search query. Try searching for different keywords like llama, mistral, or falcon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="models-grid">
            {models.map(m => (
              <Link
                key={m.id}
                href={`/models/${m.id}`}
                className="group relative bg-[#121915] hover:bg-[#15201b] border border-[#202c26] hover:border-[#35493e] rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono text-[#75a691] truncate max-w-[200px]">
                      {m.author}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.gated && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#fbbf24] bg-[#2a2212] border border-[#48391b] px-1.5 py-0.5 rounded">
                          <ShieldAlert size={10} />
                          Gated
                        </span>
                      )}
                      {m.support_status === 'supported_llm' && (
                        <span className="text-[10px] font-mono text-[#75a691] bg-[#16231d] border border-[#2a3c33] px-1.5 py-0.5 rounded">
                          Supported
                        </span>
                      )}
                      {m.support_status === 'unsupported_architecture' && (
                        <span className="text-[10px] font-mono text-[#f87171] bg-[#291717] border border-[#4d2424] px-1.5 py-0.5 rounded">
                          Unsupported Arch
                        </span>
                      )}
                      {m.support_status === 'unsupported_modality' && (
                        <span className="text-[10px] font-mono text-[#f87171] bg-[#291717] border border-[#4d2424] px-1.5 py-0.5 rounded">
                          Non-LLM
                        </span>
                      )}
                      {m.support_status === 'incomplete_metadata' && (
                        <span className="text-[10px] font-mono text-[#fbbf24] bg-[#2a2212] border border-[#48391b] px-1.5 py-0.5 rounded">
                          Incomplete
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-[#e4ece7] group-hover:text-[#a0c5b3] transition-colors truncate mb-1">
                    {m.model_name}
                  </h3>

                  <p className="text-[11px] text-[#61756a] font-mono truncate mb-3">
                    {m.id}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#1b2520] flex items-center justify-between text-[11px] text-[#708479]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1" title="Downloads">
                      <Download size={12} className="text-[#55695e]" />
                      {formatNumber(m.downloads)}
                    </span>
                    <span className="flex items-center gap-1" title="Likes">
                      <Heart size={12} className="text-[#55695e]" />
                      {formatNumber(m.likes)}
                    </span>
                  </div>

                  {m.total_params ? (
                    <span className="font-mono text-[#9bb7a8] text-[10px]">
                      {formatParams(m.total_params)}
                    </span>
                  ) : m.pipeline_tag ? (
                    <span className="font-mono text-[10px] text-[#55695e]">
                      {m.pipeline_tag}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Cursor Pagination Button */}
        {hasMore && !isLoading && (
          <div className="text-center pt-4">
            <button
              type="button"
              id="load-more-btn"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#19241f] hover:bg-[#22312a] border border-[#2c3d35] hover:border-[#3e564a] text-xs font-medium text-[#e4ece7] transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-[#75a691]" />
                  <span>Loading more models...</span>
                </>
              ) : (
                <>
                  <span>Load More Models</span>
                  <ArrowRight size={13} className="text-[#75a691]" />
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
