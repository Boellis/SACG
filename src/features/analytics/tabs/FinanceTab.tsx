import { useAlx } from '../AnalyticsPage';

export default function FinanceTab() {
  const { w } = useAlx();
  return <p data-testid="tab-finance">Finance — {w.label}</p>;
}
