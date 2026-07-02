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
  { to: '/calendar', label: 'Calendar' },
  { to: '/my-hours', label: 'My Hours' },
  { to: '/forum', label: 'Message Board' },
  { to: '/lounge', label: 'Lounge' },
  { to: '/messages', label: 'Messages' },
  { to: '/documents', label: 'Documents' },
  { to: '/polls', label: 'Polls' },
];

const adminNavItems: NavItem[] = [
  { to: '/members', label: 'Members' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/dues', label: 'Dues' },
  { to: '/settings', label: 'Settings' },
  { to: '/email', label: 'Email' },
];

function NavItems() {
  const { role } = useAuth();
  const items = role === 'admin' ? [...memberNavItems, ...adminNavItems] : memberNavItems;

  return (
    <nav className="flex flex-col gap-1 mt-4">
      {items.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-garden-700 text-white'
                : 'text-garden-100 hover:bg-garden-700/60'
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
  const displayName = member?.displayName || user?.email || 'Member';

  const handleSignOut = () => {
    void signOut(auth);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar */}
      <aside className="w-full md:w-56 bg-garden-600 text-white flex flex-col md:fixed md:inset-y-0 md:left-0 z-10">
        <div className="p-4 text-xl font-bold tracking-tight border-b border-garden-700/50">
          🌱 SACG
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <NavItems />
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
