import { useMemo, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import './analytics.css';
import { useAnalyticsData } from './useAnalyticsData';
import {
  resolveWindow, bucketFor,
  type RangeKey, type AnalyticsWindow, type AnalyticsDataset, type Bucket,
} from '../../logic/analytics';
import { VIZ, type VizMode, type VizTokens } from './tokens';
import OverviewTab from './tabs/OverviewTab';
import FinanceTab from './tabs/FinanceTab';
import OperationsTab from './tabs/OperationsTab';
import EngagementTab from './tabs/EngagementTab';

export interface AlxContext {
  data: AnalyticsDataset; w: AnalyticsWindow; bucket: Bucket;
  tokens: VizTokens; mode: VizMode; now: Date; demo: boolean;
}
export function useAlx(): AlxContext {
  return useOutletContext<AlxContext>();
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'season', label: 'This season' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'last12mo', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];
const TABS = [
  { to: '/analytics', end: true, label: 'Overview' },
  { to: '/analytics/finance', end: false, label: 'Finance' },
  { to: '/analytics/operations', end: false, label: 'Operations' },
  { to: '/analytics/engagement', end: false, label: 'Engagement' },
];

function Shell() {
  const now = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangeKey>('season');
  const [demo, setDemo] = useState(() => localStorage.getItem('alx-demo') === '1');
  const [mode, setMode] = useState<VizMode>(() => (localStorage.getItem('alx-mode') === 'dark' ? 'dark' : 'light'));
  const { data, error } = useAnalyticsData(demo, now);

  const seasonYear = Number(data?.settings.currentSeason) || now.getUTCFullYear();
  const w = useMemo(() => resolveWindow(range, now, seasonYear), [range, now, seasonYear]);

  const toggleDemo = () => {
    const next = !demo;
    localStorage.setItem('alx-demo', next ? '1' : '0');
    setDemo(next);
  };
  const toggleMode = () => {
    const next: VizMode = mode === 'light' ? 'dark' : 'light';
    localStorage.setItem('alx-mode', next);
    setMode(next);
  };

  return (
    <div className="alx-root" data-mode={mode}>
      <div className="alx-print-header">
        <h1 className="text-xl font-bold">South Austin Community Garden — Committee Report</h1>
        <p className="text-sm" style={{ color: 'var(--alx-text-2)' }}>
          {w.label} · generated {now.toLocaleDateString('en-US', { dateStyle: 'long' })}
          {demo ? ' · DEMO DATA' : ''}
        </p>
      </div>

      <div className="alx-controls flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-2">Analytics</h1>
        {demo && <span className="alx-badge-demo">DEMO DATA</span>}
        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)}
              className="alx-tab" aria-current={range === r.key ? 'page' : undefined}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--alx-text-2)' }}>
            <input type="checkbox" checked={demo} onChange={toggleDemo} aria-label="Demo data" />
            Demo data
          </label>
          <button type="button" onClick={toggleMode} className="alx-tab" aria-label={mode === 'light' ? 'Dark' : 'Light'}>
            {mode === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <button type="button" onClick={() => window.print()} className="alx-tab" style={{ border: '1px solid var(--alx-border)' }}>
            🖨 Print committee report
          </button>
        </div>
      </div>

      <nav className="alx-tabs flex gap-1 mb-5" aria-label="Dashboard sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="alx-tab">{t.label}</NavLink>
        ))}
      </nav>

      {error && <p className="text-xs mb-3" style={{ color: '#d03b3b' }}>{error}</p>}

      {data === null ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="alx-card animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <Outlet context={{ data, w, bucket: bucketFor(range), tokens: VIZ[mode], mode, now, demo } satisfies AlxContext} />
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<OverviewTab />} />
        <Route path="finance" element={<FinanceTab />} />
        <Route path="operations" element={<OperationsTab />} />
        <Route path="engagement" element={<EngagementTab />} />
      </Route>
    </Routes>
  );
}
