import {
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  doc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { plotsCol, plotDoc } from '../../data/collections';
import { db } from '../../lib/firebase';
import type { Plot, PlotHalf, Member, Crop, PlotLayout, PlotLayout3D } from '../../lib/types';
import { splitPlotIds } from '../../logic/plots';

export function listenPlots(cb: (plots: Plot[]) => void): Unsubscribe {
  return onSnapshot(plotsCol, (snap) => {
    cb(snap.docs.map((d) => d.data()));
  });
}

export function listenPlot(id: string, cb: (plot: Plot | null) => void): Unsubscribe {
  return onSnapshot(plotDoc(id), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export interface CreatePlotInput {
  id: string;
  number: number;
  half?: PlotHalf;
  size?: string;
  duesAmount?: number;
  depositAmount?: number;
  season: string;
}

export async function createPlot(input: CreatePlotInput): Promise<void> {
  const { id, number, half, size, duesAmount, depositAmount, season } = input;
  await setDoc(plotDoc(id), {
    id,
    number,
    half: half ?? 'whole',
    size: size ?? '',
    status: 'available',
    holderMemberId: null,
    holderMemberIds: [],
    holderName: null,
    duesAmount: duesAmount ?? 0,
    depositAmount: depositAmount ?? 25,
    duesPaid: false,
    depositPaid: false,
    season,
    crops: [],
    notes: '',
  } as unknown as Plot);
}

export async function updatePlot(id: string, patch: Partial<Plot>): Promise<void> {
  await updateDoc(plotDoc(id), patch as Record<string, unknown>);
}

export async function toggleDuesPaid(id: string, paid: boolean): Promise<void> {
  await updateDoc(plotDoc(id), {
    duesPaid: paid,
    paidDate: paid ? serverTimestamp() : null,
  } as Record<string, unknown>);
}

export async function toggleDepositPaid(id: string, paid: boolean): Promise<void> {
  await updateDoc(plotDoc(id), {
    depositPaid: paid,
  } as Record<string, unknown>);
}

export async function assignPlot(plot: Plot, member: Member): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'plots', plot.id), {
    holderMemberId: member.id,
    holderMemberIds: [member.id],
    holderName: member.displayName,
    status: 'assigned',
  });
  if (member.status === 'pending') {
    batch.update(doc(db, 'members', member.id), {
      status: 'active',
      joinedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function unassignPlot(plotId: string): Promise<void> {
  await updateDoc(plotDoc(plotId), {
    holderMemberId: null,
    holderMemberIds: [],
    holderName: null,
    status: 'available',
  } as Record<string, unknown>);
}

/**
 * Set the full holder list for a plot (used by the admin add/remove co-gardener
 * UI). The first entry is the primary holder — it drives dues attribution and
 * leads the displayed holder name. Passing an empty list clears the plot.
 */
export async function setPlotHolders(
  plotId: string,
  holders: { id: string; name: string }[],
): Promise<void> {
  const ids = holders.map((h) => h.id);
  await updateDoc(plotDoc(plotId), {
    holderMemberIds: ids,
    holderMemberId: ids[0] ?? null,
    holderName: holders.map((h) => h.name).join(' & ') || null,
    status: ids.length > 0 ? 'assigned' : 'available',
  } as Record<string, unknown>);
}

export async function splitPlot(plot: Plot): Promise<void> {
  const { a: aId, b: bId } = splitPlotIds(plot.number);
  const batch = writeBatch(db);
  const halfData = {
    number: plot.number,
    size: plot.size ?? '',
    status: 'available' as const,
    holderMemberId: null,
    holderMemberIds: [],
    holderName: null,
    duesAmount: plot.duesAmount,
    depositAmount: plot.depositAmount,
    duesPaid: false,
    depositPaid: false,
    season: plot.season,
    crops: [],
    mapPos: null,
    notes: '',
  };
  batch.set(doc(db, 'plots', aId), { ...halfData, half: 'A' as PlotHalf });
  batch.set(doc(db, 'plots', bId), { ...halfData, half: 'B' as PlotHalf });
  batch.delete(doc(db, 'plots', plot.id));
  await batch.commit();
}

export async function setCrops(plotId: string, crops: Crop[]): Promise<void> {
  await updateDoc(plotDoc(plotId), { crops } as Record<string, unknown>);
}

export async function setPlotLayout(plotId: string, layout: PlotLayout): Promise<void> {
  await updateDoc(plotDoc(plotId), { layout } as Record<string, unknown>);
}

export async function setPlotLayout3d(plotId: string, layout: PlotLayout3D): Promise<void> {
  await updateDoc(plotDoc(plotId), { layout3d: layout } as Record<string, unknown>);
}

/** Log that the plot was just watered (server time; displayed in Central). */
export async function markPlotWatered(plotId: string): Promise<void> {
  await updateDoc(plotDoc(plotId), { lastWateredAt: serverTimestamp() } as Record<string, unknown>);
}
