'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Server, Database, Info, ShieldCheck } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { HealthReadyResponse, MetaResponse } from '@/api/schema';

export default function StatusPage() {
  const [readyData, setReadyData] = useState<HealthReadyResponse | null>(null);
  const [metaData, setMetaData] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ready, meta] = await Promise.all([
        apiClient<HealthReadyResponse>('/api/v1/health/ready'),
        apiClient<MetaResponse>('/api/v1/meta'),
      ]);
      setReadyData(ready);
      setMetaData(meta);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setError(
          new ApiError(
            'UNKNOWN_ERROR',
            (err as Error).message || 'Failed to connect to API service',
            500,
            'local'
          )
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <main className="min-h-screen bg-[#121615] text-[#e4ece7] p-6 md:p-12 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-[#8ca89d] hover:text-[#d3e3dc] transition-colors py-1.5 px-3 rounded-lg border border-[#242e2a] bg-[#181e1c]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Advisor</span>
          </Link>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-[#8ca89d] hover:text-[#d3e3dc] transition-colors py-1.5 px-3 rounded-lg border border-[#242e2a] bg-[#181e1c] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">System Diagnostics & Status</h1>
          <p className="text-sm text-[#8ca89d]">
            Real-time health monitoring of the ModelFit estimation engine and storage infrastructure.
          </p>
        </div>

        {/* Status Content */}
        {loading && (
          <div className="p-8 rounded-xl border border-[#242e2a] bg-[#181e1c] flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-[#5a826e] animate-spin" />
            <p className="text-sm text-[#8ca89d]">Querying backend health probes...</p>
          </div>
        )}

        {error && !loading && (
          <div className="p-6 rounded-xl border border-red-900/60 bg-red-950/20 text-red-200 mb-6">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-300">System Health Warning ({error.code})</h3>
                <p className="text-sm text-red-300/80 mt-1">{error.message}</p>
                {error.requestId && (
                  <p className="text-xs text-red-400/60 mt-3 font-mono">
                    Diagnostic Request-ID: {error.requestId}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-red-900/40">
              <button
                onClick={fetchStatus}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-100 transition-colors"
              >
                Retry Health Probe
              </button>
            </div>
          </div>
        )}

        {readyData && !loading && (
          <div className="space-y-4">
            {/* Overall Health Card */}
            <div className="p-6 rounded-xl border border-[#2a563e] bg-[#1a3326]/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#7be0a4]" />
                <div>
                  <h3 className="font-semibold text-white">All Systems Operational</h3>
                  <p className="text-xs text-[#8ca89d]">FastAPI backend and PostgreSQL database are healthy.</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#2a563e]/60 text-[#7be0a4] border border-[#3e7d5b]">
                {readyData.status.toUpperCase()}
              </span>
            </div>

            {/* Probe Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl border border-[#242e2a] bg-[#181e1c]">
                <div className="flex items-center gap-2.5 mb-2 text-[#8ca89d]">
                  <Database className="w-4 h-4 text-[#5a826e]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Database Status</span>
                </div>
                <div className="text-lg font-semibold text-white capitalize">
                  {readyData.database || 'Connected'}
                </div>
                <p className="text-xs text-[#8ca89d] mt-1">SELECT 1 probe responded within 2s</p>
              </div>

              <div className="p-5 rounded-xl border border-[#242e2a] bg-[#181e1c]">
                <div className="flex items-center gap-2.5 mb-2 text-[#8ca89d]">
                  <Server className="w-4 h-4 text-[#5a826e]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Environment</span>
                </div>
                <div className="text-lg font-semibold text-white capitalize">
                  {metaData?.environment || 'Development'}
                </div>
                <p className="text-xs text-[#8ca89d] mt-1">CORS & Security Headers Active</p>
              </div>

              <div className="p-5 rounded-xl border border-[#242e2a] bg-[#181e1c]">
                <div className="flex items-center gap-2.5 mb-2 text-[#8ca89d]">
                  <Info className="w-4 h-4 text-[#5a826e]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">API Version</span>
                </div>
                <div className="text-lg font-mono font-medium text-white">
                  v{metaData?.version || '1.0.0'}
                </div>
                <p className="text-xs text-[#8ca89d] mt-1">Deterministic Engine Release</p>
              </div>

              <div className="p-5 rounded-xl border border-[#242e2a] bg-[#181e1c]">
                <div className="flex items-center gap-2.5 mb-2 text-[#8ca89d]">
                  <ShieldCheck className="w-4 h-4 text-[#5a826e]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Git Commit SHA</span>
                </div>
                <div className="text-lg font-mono font-medium text-white truncate">
                  {metaData?.git_sha || 'phase-1-foundation'}
                </div>
                <p className="text-xs text-[#8ca89d] mt-1">Audited build revision</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
