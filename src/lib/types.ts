import { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'member';
export type MemberStatus = 'pending' | 'active' | 'inactive';
export type PlotHalf = 'whole' | 'A' | 'B';
export type PlotStatus = 'available' | 'assigned' | 'reserved' | 'inactive';
export type EventType = 'workday' | 'meeting' | 'other';
export type RsvpStatus = 'yes' | 'no' | 'maybe';

export interface Member {
  id: string;            // = auth uid (or auto-id for manual prospects)
  uid: string | null;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  status: MemberStatus;
  joinedAt?: Timestamp;
  createdAt: Timestamp;
  currentYearHours: number;
  notes?: string;
}

export interface Crop { name: string; plantedOn?: Timestamp; notes?: string; }

export type PlotShapeType = 'rect' | 'circle' | 'triangle';
export interface PlotShape { id: string; type: PlotShapeType; x: number; y: number; w: number; h: number; color: string; label: string; }
export interface PlotLayout { shapes: PlotShape[]; }

export interface Plot {
  id: string;            // "12" | "12A" | "12B"
  number: number;
  half: PlotHalf;
  size?: string;
  status: PlotStatus;
  holderMemberId?: string;
  holderName?: string;
  duesAmount: number;
  depositAmount: number;
  duesPaid: boolean;
  depositPaid: boolean;
  paidDate?: Timestamp;
  season: string;
  crops: Crop[];
  mapPos?: { row: number; col: number };
  layout?: PlotLayout;
  notes?: string;
}

export interface GardenEvent {
  id: string;
  title: string;
  type: EventType;
  start: Timestamp;
  end: Timestamp;
  allDay: boolean;
  location?: string;
  description?: string;
  createdBy: string;
}

export interface Rsvp { id: string; status: RsvpStatus; displayName: string; respondedAt: Timestamp; }

export interface VolunteerHour {
  id: string;
  memberId: string;
  date: Timestamp;
  hours: number;
  eventId?: string;
  description?: string;
  recordedBy: string;
  createdAt: Timestamp;
}

export interface OrgSettings {
  requiredHours: number;     // 12
  firstHalfHours: number;    // 6
  firstHalfMonths: number;   // 6
  defaultDeposit: number;    // 25
  currentSeason: string;     // "2026"
  duesBySize?: Record<string, number>;
  contactEmail: string;
}

export interface ForumThread {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
}

export interface ForumReply {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
}
