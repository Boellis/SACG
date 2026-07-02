import { useEffect, useState } from 'react';
import type { Plot } from '../../lib/types';
import { listenPlots } from './plotsApi';
// The immersive R3F scene lives in a sibling .jsx (allowJs is on) so the whole
// three.js / drei bundle stays inside this lazy-loaded chunk (App lazy-loads this
// page), keeping the main app bundle lean — same pattern as PlotDetail.
import WholeGarden3D from './layout3d/WholeGarden3D';

export default function WholeGardenPage() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = listenPlots((p) => {
      setPlots(p);
      setLoaded(true);
    });
    return unsub;
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Whole Garden</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every plot in the community garden, each showing its own saved 3D layout. Fly around to explore everyone&apos;s
          designs — drag to orbit, scroll to zoom, and use the camera buttons to jump to a view.
        </p>
      </div>

      <WholeGarden3D plots={plots} />

      {!loaded && <p className="text-sm text-gray-400">Loading plots…</p>}
    </div>
  );
}
