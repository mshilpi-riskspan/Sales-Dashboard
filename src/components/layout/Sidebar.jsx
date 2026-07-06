import { ChartBarIcon, UserGroupIcon, MegaphoneIcon, CalendarIcon, TrophyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const ICON_MAP = { ChartBarIcon, UserGroupIcon, MegaphoneIcon, CalendarIcon, TrophyIcon, ExclamationTriangleIcon };

export default function Sidebar({ navItems, activePage, onNavigate }) {
  return (
    <aside className="flex flex-col w-52 shrink-0 bg-rs-navy h-screen">
      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">RiskSpan</span>
        <span className="block text-white/50 text-[10px] uppercase tracking-widest mt-0.5">
          Sales Intelligence
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5
                ${isActive
                  ? 'bg-rs-teal/20 text-rs-teal'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-white/30 text-[10px]">v1.0 · Sales Module</p>
      </div>
    </aside>
  );
}
