import { useRef, useEffect } from "react";
import type { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const active = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  if (tabs.length === 0) return null;

  const tabIcon = (type: Tab["type"]) => {
    switch (type) {
      case "data": return "📊";
      case "structure": return "🏗️";
    }
  };

  return (
    <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-thin"
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 py-2 text-xs font-medium
              border-r border-gray-200 cursor-pointer shrink-0 min-w-[120px]
              transition-colors select-none
              ${
                activeTabId === tab.id
                  ? "bg-white text-gray-900 border-b-2 border-b-blue-500"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }
            `}
          >
            <span className="text-sm">{tabIcon(tab.type)}</span>
            <span className="truncate max-w-[140px]">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="ml-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
