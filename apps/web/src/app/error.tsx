'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#121615] text-[#e4ece7] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-8 rounded-2xl border border-red-900/60 bg-red-950/20 max-w-md w-full flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-800/50 flex items-center justify-center mb-4 text-red-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Application Error</h2>
        <p className="text-sm text-red-200/80 mb-6">
          {error.message || 'An unexpected error interrupted the advisor interface.'}
        </p>
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 text-sm text-white bg-red-800/60 hover:bg-red-700/60 border border-red-600/50 transition-colors py-2 px-4 rounded-lg font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
