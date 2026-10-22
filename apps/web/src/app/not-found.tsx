import Link from 'next/link';
import { HelpCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#121615] text-[#e4ece7] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-8 rounded-2xl border border-[#242e2a] bg-[#181e1c] max-w-md w-full flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-[#202925] border border-[#32403a] flex items-center justify-center mb-4">
          <HelpCircle className="w-6 h-6 text-[#5a826e]" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Page Not Found (404)</h1>
        <p className="text-sm text-[#8ca89d] mb-6">
          The hardware configuration or view you requested does not exist.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-[#7be0a4] bg-[#1a3326] border border-[#2a563e] hover:bg-[#204432] transition-colors py-2 px-4 rounded-lg font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Advisor</span>
        </Link>
      </div>
    </main>
  );
}
