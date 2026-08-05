import { useAlx } from '../AnalyticsPage';

export default function OverviewTab() {
  const { w } = useAlx();
  return <p data-testid="tab-overview">Overview — {w.label}</p>;
}
