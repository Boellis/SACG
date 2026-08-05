import { useAlx } from '../AnalyticsPage';

export default function OperationsTab() {
  const { w } = useAlx();
  return <p data-testid="tab-operations">Operations — {w.label}</p>;
}
