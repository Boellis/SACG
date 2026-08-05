import { useAlx } from '../AnalyticsPage';

export default function EngagementTab() {
  const { w } = useAlx();
  return <p data-testid="tab-engagement">Engagement — {w.label}</p>;
}
