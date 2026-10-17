import React from 'react';
import { Home, Calendar, BookOpen, Users, LayoutGrid } from 'lucide-react';
import UnreadBadge from '../UnreadBadge';

// `badges` maps a tab name to an unread count shown on its icon
export function BottomNav({ activeTab, onChange, onProfileClick, userAvatar = 'JD', badges = {} }) {
  const tabs = [
    { name: 'Dashboard', icon: Home, active: true },
    { name: 'Timeline', icon: Calendar, active: false },
    { name: 'Resources', icon: BookOpen, active: false },
    { name: 'Workspaces', icon: LayoutGrid, active: false },
    { name: 'Team', icon: Users, active: false },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 glass-dark sm:glass border-t sm:bottom-auto sm:top-0 sm:border-b py-3 px-6 z-50">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => onChange(tab.name)}
            className={`flex flex-col items-center justify-center space-y-1 w-16 transition-all ${
              activeTab === tab.name
                ? 'text-brand-600 sm:text-brand-900 scale-110'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <span className="relative">
              <tab.icon size={22} className={activeTab === tab.name ? 'stroke-[2.5px]' : ''} />
              <UnreadBadge count={badges[tab.name]} />
            </span>
            <span className="text-[10px] font-medium">{tab.name}</span>
          </button>
        ))}
        
        {/* Hidden on mobile, visible on desktop as a profile/actions area */}
        <div className="hidden sm:flex items-center space-x-4">
          <button 
            onClick={onProfileClick}
            className="h-8 w-8 rounded-full bg-brand-200 border-2 border-white shadow-sm flex items-center justify-center text-brand-700 font-bold text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title="View Account"
          >
            {userAvatar}
          </button>
        </div>
      </div>
    </div>
  );
}
