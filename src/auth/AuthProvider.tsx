import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { onSnapshot, getDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { memberDoc } from '../data/collections';
import type { Member, Role, MemberStatus } from '../lib/types';

export interface AuthContextValue {
  user: User | null;
  member: Member | null;
  role: Role | undefined;
  status: MemberStatus | undefined;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within <AuthProvider>');
  return ctx;
}

/**
 * Ensure a member document exists for the given user.
 * Creates one with pending status on first sign-up; never overwrites an existing doc.
 */
export async function ensureMemberDoc(user: User, displayName?: string): Promise<void> {
  // Use untyped ref to avoid Timestamp field type conflicts with serverTimestamp()
  const ref = doc(db, 'members', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: displayName ?? user.displayName ?? '',
      role: 'member',
      status: 'pending',
      createdAt: serverTimestamp(),
      currentYearHours: 0,
    });
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  // Track whether auth state is known and member snapshot resolved
  const [authResolved, setAuthResolved] = useState(false);
  const [memberResolved, setMemberResolved] = useState(false);

  useEffect(() => {
    let unsubMember: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up previous member listener
      if (unsubMember) {
        unsubMember();
        unsubMember = null;
      }

      setUser(firebaseUser);
      setAuthResolved(true);

      if (firebaseUser) {
        // Reset member resolved state for the new user
        setMemberResolved(false);
        unsubMember = onSnapshot(memberDoc(firebaseUser.uid), (snap) => {
          setMember(snap.exists() ? snap.data() : null);
          setMemberResolved(true);
        });
      } else {
        setMember(null);
        setMemberResolved(true);
      }
    });

    return () => {
      unsubAuth();
      if (unsubMember) unsubMember();
    };
  }, []);

  useEffect(() => {
    if (authResolved && memberResolved) {
      setLoading(false);
    }
  }, [authResolved, memberResolved]);

  const value: AuthContextValue = {
    user,
    member,
    role: member?.role,
    status: member?.status,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { firebaseSignOut as signOut };
