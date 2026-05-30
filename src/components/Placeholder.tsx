import { Card } from './ui';

export default function Placeholder({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className="text-gray-500 text-sm">Coming soon</p>
    </Card>
  );
}
