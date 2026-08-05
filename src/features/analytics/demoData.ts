// Deterministic demo dataset for presentations. Same TypeScript shapes as
// production so the logic layer can't tell live from demo. No firebase
// runtime imports (component tests mock 'firebase/firestore' as {}).
import type { Timestamp } from 'firebase/firestore';
import type {
  Member, Plot, VolunteerHour, GardenEvent, ForumThread, Poll, PollVote, Rsvp,
} from '../../lib/types';
import { DEFAULT_ORG_SETTINGS, type AnalyticsDataset, type DuesHistoryRow } from '../../logic/analytics';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoTs(d: Date): Timestamp {
  return { toDate: () => d, toMillis: () => d.getTime() } as unknown as Timestamp;
}

const FIRST = ['Ada','Rosa','Miguel','June','Theo','Priya','Sam','Lena','Omar','Nora','Eli','Maya','Ken','Iris','Joel','Faye','Hugo','Zoe','Ray','Tess','Ana','Beto','Cleo','Dev','Em','Gus','Hana','Ivan','Jade','Kai','Lior','Mona','Nico','Opal','Pia','Quinn','Rui','Sage','Tom','Uma','Vera','Wes','Ximena','Yara','Zed','Avery','Blair','Cruz','Dana','Ellis','Fern','Gray','Hollis','Indy','Jules','Kit','Lane','Marlo','Noel','Oakley','Parker','Reese','Skyler','Tatum','Vale','Winter','Arlo','Birdie','Cedar','Dove'];
const LAST = ['Rusnak','Widhalm','Harris','Nichols','Zimmermann','Good','Ellis','Vasquez','Okafor','Lindqvist','Marsh','Bell','Ito','Farid','Novak','Reyes','Stone','Klein','Bauer','Fox'];
const CROPS = ['tomato','kale','corn','squash','okra','basil','pepper','cucumber','zucchini','marigold','onion','strawberry','pumpkin','radish'];
const TIER_AMOUNTS = [35, 42, 55, 69];

export function buildDemoDataset(now: Date): AnalyticsDataset {
  const rand = mulberry32(20260805);
  const t = now.getTime();
  const daysAgo = (n: number) => new Date(t - n * 86400_000);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  // --- members: ~70 joining over ~2.5 years, seasonal clustering (spring-heavy)
  const members: Member[] = [];
  for (let i = 0; i < 70; i++) {
    const back = Math.floor(rand() * 900); // up to ~2.5y
    const joined = daysAgo(back);
    // nudge toward Feb–May: re-roll month once if it landed Jul–Dec
    const m = joined.getUTCMonth();
    const join2 = m >= 6 && rand() < 0.5
      ? new Date(Date.UTC(joined.getUTCFullYear(), Math.floor(rand() * 4) + 1, 1 + Math.floor(rand() * 27)))
      : joined;
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    members.push({
      id: `demo-m${i}`, uid: `demo-m${i}`, email: `demo${i}@example.com`,
      displayName: name, role: 'member',
      status: i < 62 ? 'active' : 'pending',
      joinedAt: demoTs(join2 < now ? join2 : joined),
      createdAt: demoTs(join2 < now ? join2 : joined),
      currentYearHours: 0,
    });
  }

  // --- plots: 42, ~90% assigned; dues mostly paid; upkeep signals span all tiers
  const plots: Plot[] = [];
  for (let i = 1; i <= 42; i++) {
    const assigned = rand() < 0.9;
    const holder = assigned ? members[i % 60] : undefined;
    const amount = TIER_AMOUNTS[i % TIER_AMOUNTS.length];
    const duesPaid = assigned && rand() < 0.8;
    const upkeepRoll = rand();
    const crops = upkeepRoll < 0.75
      ? [
          // <0.4 band plants fresh (≤120d); the okay band plants stale (>130d)
          // so it can't leak into "thriving" via plantedFresh.
          { name: pick(CROPS), plantedOn: demoTs(daysAgo(upkeepRoll < 0.4 ? Math.floor(rand() * 100) + 10 : Math.floor(rand() * 200) + 130)) },
          { name: pick(CROPS) },
        ]
      : [];
    const lastWateredAt =
      upkeepRoll < 0.4 ? demoTs(daysAgo(Math.floor(rand() * 10) + 1))       // fresh → thriving
      : upkeepRoll >= 0.75 && upkeepRoll < 0.88 ? demoTs(daysAgo(45 + Math.floor(rand() * 60))) // stale, no crops → attention
      : undefined;                                                           // rest: okay / nodata
    plots.push({
      id: String(i), number: i, half: 'whole', size: `${amount}`,
      status: assigned ? 'assigned' : 'available',
      holderMemberId: holder?.id, holderMemberIds: holder ? [holder.id] : [],
      holderName: holder?.displayName,
      duesAmount: amount, depositAmount: 25,
      duesPaid, depositPaid: assigned,
      paidDate: duesPaid ? demoTs(daysAgo(Math.floor(rand() * 180) + 5)) : undefined,
      season: '2026',
      crops,
      ...(lastWateredAt ? { lastWateredAt } : {}),
    });
  }

  // --- volunteer hours: ~2.5y weekly entries, spring/fall peaks
  const hours: VolunteerHour[] = [];
  let hid = 0;
  for (let back = 900; back >= 0; back -= 7) {
    const d = daysAgo(back);
    const m = d.getUTCMonth();
    const seasonal = m >= 2 && m <= 5 ? 1.6 : m >= 8 && m <= 10 ? 1.3 : 0.7;
    const entries = Math.floor(rand() * 4 * seasonal);
    for (let e = 0; e < entries; e++) {
      const who = members[Math.floor(rand() * 62)];
      hours.push({
        id: `demo-h${hid++}`, memberId: who.id,
        date: demoTs(new Date(Math.min(d.getTime() + Math.floor(rand() * 6) * 86400_000, t))),
        hours: 1 + Math.floor(rand() * 3),
        recordedBy: who.id, createdAt: demoTs(d),
      });
    }
  }

  // --- events + rsvps: ~30 events over 2.5y (a few upcoming), workday/meeting mix
  const events: GardenEvent[] = [];
  const rsvpsByEvent: Record<string, Rsvp[]> = {};
  for (let i = 0; i < 30; i++) {
    // i=0..27 spread over the past ~2.4y; the last two land in the future
    // (negative "days ago") so nextEvent() has something upcoming to show.
    const back = 880 - i * 30 - (i >= 28 ? 60 : 0) + Math.floor(rand() * 10);
    const start = daysAgo(back);
    const id = `demo-e${i}`;
    events.push({
      id, title: i % 2 ? 'Community workday' : 'Monthly meeting',
      type: i % 2 ? 'workday' : 'meeting',
      start: demoTs(start), end: demoTs(new Date(start.getTime() + 2 * 3600_000)),
      allDay: false, createdBy: 'demo-m0',
    });
    const n = 5 + Math.floor(rand() * 20);
    rsvpsByEvent[id] = Array.from({ length: n }, (_, j) => ({
      id: `demo-r${i}-${j}`,
      status: rand() < 0.6 ? 'yes' : rand() < 0.5 ? 'maybe' : 'no',
      displayName: members[j % 62].displayName,
      respondedAt: demoTs(daysAgo(Math.max(0, back - 3))),
    }));
  }

  // --- forum threads & polls
  const threads: ForumThread[] = Array.from({ length: 40 }, (_, i) => ({
    id: `demo-t${i}`, title: `Thread ${i}`, body: '…',
    authorId: members[i % 62].id, authorName: members[i % 62].displayName,
    createdAt: demoTs(daysAgo(Math.floor(rand() * 800))),
  }));
  const polls: Poll[] = Array.from({ length: 6 }, (_, i) => ({
    id: `demo-p${i}`, question: `Poll ${i}?`,
    options: [{ id: '0', text: 'Yes' }, { id: '1', text: 'No' }],
    createdAt: demoTs(daysAgo(60 + i * 120)), createdBy: 'demo-m0', authorName: 'Ada',
    closed: i > 3,
  }));
  const votesByPoll: Record<string, PollVote[]> = {};
  for (const p of polls) {
    const n = 8 + Math.floor(rand() * 30);
    votesByPoll[p.id] = Array.from({ length: n }, (_, j) => ({
      id: `demo-v${p.id}-${j}`, optionId: rand() < 0.6 ? '0' : '1',
      memberId: members[j % 62].id,
      createdAt: demoTs(daysAgo(Math.max(0, Math.floor(rand() * 100)))),
    }));
  }

  // --- three seasons of dues rates (the "dues increases" story)
  const duesHistory: DuesHistoryRow[] = [];
  const seasonRates: Record<string, number[]> = {
    '2024': [30, 36, 48, 60], '2025': [32, 39, 52, 65], '2026': TIER_AMOUNTS,
  };
  for (const [season, rates] of Object.entries(seasonRates)) {
    rates.forEach((amount, i) => {
      duesHistory.push({ season, tier: `$${TIER_AMOUNTS[i]}`, amount });
    });
  }

  return {
    members, plots, hours, events, threads, polls,
    rsvpsByEvent, votesByPoll, duesHistory,
    settings: DEFAULT_ORG_SETTINGS,
  };
}
