import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { signOut } from '../auth/AuthProvider';
import { auth } from '../lib/firebase';

interface NavItem {
  to: string;
  label: string;
}

const memberNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/plots', label: 'Plots' },
  { to: '/garden', label: 'Whole Garden' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/my-hours', label: 'My Hours' },
  { to: '/forum', label: 'Message Board' },
  { to: '/lounge', label: 'Lounge' },
  { to: '/messages', label: 'Messages' },
  { to: '/documents', label: 'Documents' },
  { to: '/polls', label: 'Polls' },
];

const adminNavItems: NavItem[] = [
  { to: '/analytics', label: 'Analytics' },
  { to: '/members', label: 'Members' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/dues', label: 'Dues' },
  { to: '/settings', label: 'Settings' },
  { to: '/email', label: 'Email' },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useAuth();
  const items = role === 'admin' ? [...memberNavItems, ...adminNavItems] : memberNavItems;

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-garden-700 text-white' : 'text-garden-100 hover:bg-garden-700/60'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { user, member } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = member?.displayName || user?.email || 'Member';

  const handleSignOut = () => {
    void signOut(auth);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar: full desktop sidebar; on mobile it collapses to a bar + hamburger */}
      <aside className="w-full md:w-56 bg-garden-600 text-white flex flex-col md:fixed md:inset-y-0 md:left-0 z-10">
        <div className="flex items-center justify-between p-4 border-b border-garden-700/50">
          <span className="text-xl font-bold tracking-tight">🌱 SACG</span>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="md:hidden p-1.5 -mr-1 rounded-lg hover:bg-garden-700/60 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
        {/* Nav: hidden on mobile until the hamburger is tapped; always shown on desktop */}
        <div
          className={`${menuOpen ? 'block' : 'hidden'} md:block flex-1 overflow-y-auto p-2 max-h-[70vh] md:max-h-none`}
        >
          <NavItems onNavigate={() => setMenuOpen(false)} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-56 min-h-screen">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 gap-4 shrink-0">
          <span className="text-sm text-gray-700 font-medium truncate">{displayName}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
