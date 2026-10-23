import React from 'react';
import Link from 'next/link';
import { Sliders, Cpu, Sparkles, PanelLeft, ArrowLeft, Calculator } from 'lucide-react';

interface TopToolbarProps {
  currentView: 'chat' | 'advanced' | 'report';
  onNavigate: (view: 'chat' | 'advanced' | 'report') => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenHardwareModal: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  currentView,
  onNavigate,
  isSidebarOpen,
  onToggleSidebar,
  onOpenHardwareModal,
}) => {
  return (
    <header className="h-14 border-b border-[#242e2a] bg-[#121615] px-4 flex items-center justify-between flex-shrink-0 z-20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#1e2523] transition-colors"
          title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={18} />
        </button>

        {currentView !== 'chat' ? (
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="flex items-center gap-2 text-xs font-medium text-[#96a99e] hover:text-[#e4ece7] bg-[#181e1c] hover:bg-[#202925] border border-[#27322e] px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to AI Advisor</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide uppercase text-[#617369]">
              Advisor Mode
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#527a67]" />
            <span className="text-xs text-[#96a99e]">Conversational Discovery</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/estimator"
          className="flex items-center gap-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] bg-[#181e1c] hover:bg-[#222b28] border border-[#27322e] px-3 py-1.5 rounded-lg transition-colors"
          title="Open Memory Estimator Engine"
          id="top-estimator-nav-btn"
        >
          <Calculator size={14} className="text-[#75a691]" />
          <span>Estimator</span>
        </Link>

        <button
          type="button"
          onClick={onOpenHardwareModal}
          className="hidden sm:flex items-center gap-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] bg-[#181e1c] hover:bg-[#222b28] border border-[#27322e] px-3 py-1.5 rounded-lg transition-colors"
          title="Inspect or configure detected hardware profile"
        >
          <Cpu size={14} className="text-[#75a691]" />
          <span>My Hardware</span>
        </button>

        {currentView !== 'advanced' ? (
          <button
            type="button"
            onClick={() => onNavigate('advanced')}
            className="flex items-center gap-2 text-xs font-medium text-[#e4ece7] bg-[#1d2723] hover:bg-[#273530] border border-[#3b4e45] px-3.5 py-1.5 rounded-lg transition-all shadow-sm group"
            id="top-advanced-options-btn"
          >
            <Sliders size={14} className="text-[#8eb4a1] group-hover:rotate-45 transition-transform duration-300" />
            <span>Advanced Options</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#8eb4a1] bg-[#1b2521] border border-[#33463e] px-3 py-1.5 rounded-lg">
            <Sparkles size={13} />
            <span>Advanced Estimator Active</span>
          </div>
        )}
      </div>
    </header>
  );
};
