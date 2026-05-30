import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

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

describe('Firestore security rules — baseline (deny all)', () => {
  it('denies unauthenticated reads on the plots collection', async () => {
    const ctx = testEnv.unauthenticatedContext();
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, 'plots', '1')));
  });
});
