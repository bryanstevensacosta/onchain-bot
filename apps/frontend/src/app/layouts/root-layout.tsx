import { Link, NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/tokens', label: 'Tokens' },
  { to: '/kols', label: 'KOLs' },
  { to: '/crypto-news', label: '📰 News' },
  { to: '/ops', label: 'Ops' },
];

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="px-6 py-3 flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-blue-400">
            Alpha Meta Token Scanner
          </Link>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
