import {
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { plotsCol, plotDoc } from '../../data/collections';
import type { Plot, PlotHalf } from '../../lib/types';

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
    holderName: null,
    duesAmount: duesAmount ?? 0,
    depositAmount: depositAmount ?? 25,
    duesPaid: false,
    depositPaid: false,
    paidDate: undefined,
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
