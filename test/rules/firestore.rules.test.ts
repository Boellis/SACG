import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-01-01T00:00:00Z');

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'members', 'admin1'), {
      role: 'admin',
      status: 'active',
      displayName: 'Admin',
      email: 'a@x.com',
      createdAt: NOW,
      currentYearHours: 0,
    });
    await setDoc(doc(db, 'members', 'active1'), {
      role: 'member',
      status: 'active',
      displayName: 'Active One',
      email: 'a1@x.com',
      createdAt: NOW,
      currentYearHours: 0,
    });
    await setDoc(doc(db, 'members', 'active2'), {
      role: 'member',
      status: 'active',
      displayName: 'Active Two',
      email: 'a2@x.com',
      createdAt: NOW,
      currentYearHours: 0,
    });
    await setDoc(doc(db, 'members', 'active3'), {
      role: 'member',
      status: 'active',
      displayName: 'Active Three',
      email: 'a3@x.com',
      createdAt: NOW,
      currentYearHours: 0,
    });
    await setDoc(doc(db, 'members', 'pending1'), {
      role: 'member',
      status: 'pending',
      displayName: 'Pending One',
      email: 'p1@x.com',
      createdAt: NOW,
      currentYearHours: 0,
    });
    await setDoc(doc(db, 'plots', 'P1'), {
      number: 1,
      half: 'whole',
      status: 'assigned',
      holderMemberId: 'active1',
      duesAmount: 30,
      depositAmount: 25,
      duesPaid: false,
      depositPaid: false,
      season: '2026',
      crops: [],
    });
    // Co-held plot: active1 primary, active2 co-gardener via holderMemberIds.
    await setDoc(doc(db, 'plots', 'P_CO'), {
      number: 2,
      half: 'whole',
      status: 'assigned',
      holderMemberId: 'active1',
      holderMemberIds: ['active1', 'active2'],
      duesAmount: 30,
      depositAmount: 25,
      duesPaid: false,
      depositPaid: false,
      season: '2026',
      crops: [],
    });
    await setDoc(doc(db, 'settings', 'org'), {
      requiredHours: 12,
      firstHalfHours: 6,
      firstHalfMonths: 6,
      defaultDeposit: 25,
      currentSeason: '2026',
      contactEmail: 'org@x.com',
    });
    await setDoc(doc(db, 'events', 'E1'), {
      title: 'Workday',
      type: 'workday',
      start: NOW,
      end: NOW,
      allDay: false,
    });
    // Hours docs for self-logging tests. H_active1 owned by active1, H_active2 by active2.
    await setDoc(doc(db, 'volunteerHours', 'H_active1'), {
      memberId: 'active1',
      date: NOW,
      hours: 3,
      description: 'weeding',
      recordedBy: 'active1',
      createdAt: NOW,
    });
    await setDoc(doc(db, 'volunteerHours', 'H_active2'), {
      memberId: 'active2',
      date: NOW,
      hours: 3,
      description: 'weeding',
      recordedBy: 'active2',
      createdAt: NOW,
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sacg-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

describe('Firestore security rules — plots', () => {
  it('1. unauthenticated read of plots/P1 FAILS', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'plots', 'P1')));
  });

  it('2. pending1 read plots/P1 FAILS', async () => {
    const db = testEnv.authenticatedContext('pending1').firestore();
    await assertFails(getDoc(doc(db, 'plots', 'P1')));
  });

  it('3. active1 read plots/P1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(getDoc(doc(db, 'plots', 'P1')));
  });

  it('4. admin1 read plots/P1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(getDoc(doc(db, 'plots', 'P1')));
  });

  it("4a. active2 (not holder) reads plots/P1 SUCCEEDS — members can view each other's plots", async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertSucceeds(getDoc(doc(db, 'plots', 'P1')));
  });

  it('5. active1 (holder) updates plots/P1 crops SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P1'), { crops: [{ name: 'Kale' }] }));
  });

  it('6. active1 updates plots/P1 duesPaid FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P1'), { duesPaid: true }));
  });

  it('7. active2 (not holder) updates plots/P1 crops FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P1'), { crops: [{ name: 'Kale' }] }));
  });

  it('8. admin1 updates plots/P1 duesPaid SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P1'), { duesPaid: true }));
  });

  it('8a. active1 (holder) updates plots/P1 layout SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P1'), { layout: { shapes: [] } }));
  });

  it('8b. active2 (not holder) updates plots/P1 layout FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P1'), { layout: { shapes: [] } }));
  });

  const layout3d = { version: 3, plot: { widthFt: 8, depthFt: 50, half: false }, shapes: [] };

  it('8c. active1 (holder) updates plots/P1 layout3d SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P1'), { layout3d }));
  });

  it('8d. active2 (not holder) updates plots/P1 layout3d FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P1'), { layout3d }));
  });

  it('8e. active1 (holder) updates plots/P1 lastWateredAt SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P1'), { lastWateredAt: NOW }));
  });

  it('8f. active2 (not holder) updates plots/P1 lastWateredAt FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P1'), { lastWateredAt: NOW }));
  });

  it('8g. active2 (co-gardener via holderMemberIds) updates P_CO crops SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'plots', 'P_CO'), { crops: [{ name: 'Basil' }] }));
  });

  it('8h. active2 (co-gardener) updates P_CO duesPaid FAILS — private fields stay locked', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P_CO'), { duesPaid: true }));
  });

  it('8i. active3 (not a holder of P_CO) updates its crops FAILS', async () => {
    const db = testEnv.authenticatedContext('active3').firestore();
    await assertFails(updateDoc(doc(db, 'plots', 'P_CO'), { crops: [{ name: 'Basil' }] }));
  });

  it('9. admin1 create plots/P9 SUCCEEDS; active1 create plots/P9 FAILS', async () => {
    const newPlot = {
      number: 9,
      half: 'whole',
      status: 'available',
      duesAmount: 30,
      depositAmount: 25,
      duesPaid: false,
      depositPaid: false,
      season: '2026',
      crops: [],
    };
    const adminDb = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'plots', 'P9'), newPlot));
    const activeDb = testEnv.authenticatedContext('active1').firestore();
    await assertFails(setDoc(doc(activeDb, 'plots', 'P9'), newPlot));
  });
});

describe('Firestore security rules — members', () => {
  it('10. active1 reads own members/active1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(getDoc(doc(db, 'members', 'active1')));
  });

  it('11. active1 reads members/admin1 (someone else) FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(getDoc(doc(db, 'members', 'admin1')));
  });

  it('12. active1 updates own doc displayName SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'members', 'active1'), { displayName: 'New' }));
  });

  it('13. active1 updates own doc role:admin FAILS (no self-escalation)', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(updateDoc(doc(db, 'members', 'active1'), { role: 'admin' }));
  });

  it('14. active1 changing role alongside other fields FAILS; active1 updating active2 FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(
      updateDoc(doc(db, 'members', 'active1'), { status: 'active', role: 'admin' }),
    );
    await assertFails(updateDoc(doc(db, 'members', 'active2'), { displayName: 'Hacked' }));
  });

  it('15. admin1 updates members/active1 role:admin SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'members', 'active1'), { role: 'admin' }));
  });

  it('16. newuser creates own member (member/pending) SUCCEEDS; as admin FAILS', async () => {
    const db = testEnv.authenticatedContext('newuser').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'members', 'newuser'), {
        role: 'member',
        status: 'pending',
        displayName: 'New User',
        email: 'n@x.com',
        createdAt: NOW,
        currentYearHours: 0,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'members', 'newuser'), {
        role: 'admin',
        status: 'pending',
        displayName: 'New User',
        email: 'n@x.com',
        createdAt: NOW,
        currentYearHours: 0,
      }),
    );
  });
});

describe('Firestore security rules — events/rsvps & mail', () => {
  it('17. active1 writes own rsvp SUCCEEDS; writes active2 rsvp FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'events', 'E1', 'rsvps', 'active1'), {
        status: 'yes',
        displayName: 'Active One',
        respondedAt: NOW,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'events', 'E1', 'rsvps', 'active2'), {
        status: 'yes',
        displayName: 'Active One',
        respondedAt: NOW,
      }),
    );
  });

  it('18. active1 creates mail/M1 FAILS; admin1 creates mail/M1 SUCCEEDS', async () => {
    const mailDoc = {
      to: ['x@x.com'],
      message: { subject: 'Hi', text: 'Hello' },
    };
    const activeDb = testEnv.authenticatedContext('active1').firestore();
    await assertFails(setDoc(doc(activeDb, 'mail', 'M1'), mailDoc));
    const adminDb = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'mail', 'M1'), mailDoc));
  });
});

describe('Firestore security rules — forum threads & replies', () => {
  const threadData = (authorId: string) => ({
    title: 'Hello Garden',
    body: 'Anyone have tips for tomatoes?',
    authorId,
    authorName: 'Test Author',
    createdAt: NOW,
  });

  const replyData = (authorId: string) => ({
    body: 'Try more sun!',
    authorId,
    authorName: 'Replier',
    createdAt: NOW,
  });

  beforeEach(async () => {
    // seed a thread T1 authored by active1
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'threads', 'T1'), threadData('active1'));
      await setDoc(doc(db, 'threads', 'T1', 'replies', 'R1'), replyData('active1'));
    });
  });

  it('26. active1 reads threads/T1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(getDoc(doc(db, 'threads', 'T1')));
  });

  it('27. pending1 reads threads/T1 FAILS', async () => {
    const db = testEnv.authenticatedContext('pending1').firestore();
    await assertFails(getDoc(doc(db, 'threads', 'T1')));
  });

  it('28. active1 creates thread with own authorId SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(setDoc(doc(db, 'threads', 'T_new1'), threadData('active1')));
  });

  it('29. active1 creates thread with authorId:active2 FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(setDoc(doc(db, 'threads', 'T_bad'), threadData('active2')));
  });

  it('30. pending1 creates thread FAILS (not active)', async () => {
    const db = testEnv.authenticatedContext('pending1').firestore();
    await assertFails(setDoc(doc(db, 'threads', 'T_pending'), threadData('pending1')));
  });

  it('31. active2 (non-author) deletes threads/T1 FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(deleteDoc(doc(db, 'threads', 'T1')));
  });

  it('32. active1 (author) deletes own threads/T1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'threads', 'T1')));
  });

  it('33. admin1 deletes threads/T1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'threads', 'T1')));
  });

  it('34. active1 creates reply on T1 with own authorId SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(setDoc(doc(db, 'threads', 'T1', 'replies', 'R_new'), replyData('active1')));
  });

  it('35. active1 creates reply with authorId:active2 FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(setDoc(doc(db, 'threads', 'T1', 'replies', 'R_bad'), replyData('active2')));
  });

  it('36. active2 (non-author) deletes T1/replies/R1 FAILS', async () => {
    const db = testEnv.authenticatedContext('active2').firestore();
    await assertFails(deleteDoc(doc(db, 'threads', 'T1', 'replies', 'R1')));
  });

  it('37. admin1 deletes T1/replies/R1 SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'threads', 'T1', 'replies', 'R1')));
  });
});

describe('Firestore security rules — volunteerHours self-logging', () => {
  const hoursDoc = (memberId: string, recordedBy: string) => ({
    memberId,
    date: NOW,
    hours: 3,
    description: 'weeding',
    recordedBy,
    createdAt: NOW,
  });

  it('19. active1 creates own hours doc SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'volunteerHours', 'H_new1'), hoursDoc('active1', 'active1')),
    );
  });

  it('20. active1 creates hours doc for active2 (not self) FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertFails(
      setDoc(doc(db, 'volunteerHours', 'H_new2'), hoursDoc('active2', 'active1')),
    );
  });

  it('21. pending1 creates own hours doc FAILS (not active)', async () => {
    const db = testEnv.authenticatedContext('pending1').firestore();
    await assertFails(
      setDoc(doc(db, 'volunteerHours', 'H_new3'), hoursDoc('pending1', 'pending1')),
    );
  });

  it('22. active1 updates own hours doc SUCCEEDS; updates active2 hours doc FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'volunteerHours', 'H_active1'), { hours: 4 }));
    await assertFails(updateDoc(doc(db, 'volunteerHours', 'H_active2'), { hours: 4 }));
  });

  it('23. active1 deletes own hours doc SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'volunteerHours', 'H_active1')));
  });

  it('24. active1 reads own hours doc SUCCEEDS; reads active2 hours doc FAILS', async () => {
    const db = testEnv.authenticatedContext('active1').firestore();
    await assertSucceeds(getDoc(doc(db, 'volunteerHours', 'H_active1')));
    await assertFails(getDoc(doc(db, 'volunteerHours', 'H_active2')));
  });

  it('25. admin1 creates hours doc for active1 SUCCEEDS; reads active2 hours doc SUCCEEDS', async () => {
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'volunteerHours', 'H_admin1'), hoursDoc('active1', 'admin1')),
    );
    await assertSucceeds(getDoc(doc(db, 'volunteerHours', 'H_active2')));
  });
});

describe('Firestore security rules — lounge directory, announcements & chat', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'directory', 'active1'), { displayName: 'Active One', uid: 'active1', joinedAt: NOW });
      await setDoc(doc(db, 'announcements', 'A1'), { title: 'Rule', body: 'x', createdAt: NOW, createdBy: 'admin1' });
      await setDoc(doc(db, 'conversations', 'active1_active2'), {
        participants: ['active1', 'active2'],
        participantNames: { active1: 'Active One', active2: 'Active Two' },
        createdAt: NOW,
      });
      await setDoc(doc(db, 'conversations', 'active1_active2', 'messages', 'M1'), {
        senderId: 'active1',
        text: 'hi',
        createdAt: NOW,
      });
    });
  });

  it('40. active1 reads directory SUCCEEDS; pending1 FAILS', async () => {
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'directory', 'active1')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('pending1').firestore(), 'directory', 'active1')));
  });

  it('41. admin writes directory SUCCEEDS; active1 (non-admin) FAILS', async () => {
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'directory', 'x'), { displayName: 'X', uid: null }));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'directory', 'y'), { displayName: 'Y', uid: null }));
  });

  it('42. active1 reads announcements SUCCEEDS; active1 write FAILS; admin write SUCCEEDS', async () => {
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'announcements', 'A1')));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'announcements', 'A2'), { title: 't', body: 'b', createdAt: NOW, createdBy: 'active1' }));
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'announcements', 'A3'), { title: 't', body: 'b', createdAt: NOW, createdBy: 'admin1' }));
  });

  it('43. participant reads conversation SUCCEEDS; non-participant FAILS', async () => {
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'conversations', 'active1_active2')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'conversations', 'active1_active2')));
  });

  it('44. active1 creates conversation incl. self SUCCEEDS; excluding self FAILS', async () => {
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'conversations', 'active1_active3'), { participants: ['active1', 'active3'], participantNames: {}, createdAt: NOW }));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'conversations', 'active2_active3'), { participants: ['active2', 'active3'], participantNames: {}, createdAt: NOW }));
  });

  it('45. participant sends+reads message SUCCEEDS; non-participant FAILS', async () => {
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('active1').firestore(), 'conversations', 'active1_active2', 'messages', 'M2'), { senderId: 'active1', text: 'yo', createdAt: NOW }));
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('active2').firestore(), 'conversations', 'active1_active2', 'messages', 'M1')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'conversations', 'active1_active2', 'messages', 'M1')));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'conversations', 'active1_active2', 'messages', 'M3'), { senderId: 'admin1', text: 'no', createdAt: NOW }));
  });
});
