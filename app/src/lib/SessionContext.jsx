import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearGuestSession,
  getGuestSession,
  onAuthChange,
  signIn,
  signInAnonymously,
  signOut as accountSignOut,
  signUp,
  startGuestSession,
} from './session';

const SessionContext = createContext(null);

// `status` is the one field screens should branch on:
//   'loading'       — resolving whether an account session exists
//   'signed-out'     — nobody picked guest or logged in yet (home screen)
//   'guest'         — playing locally as `guest`
//   'authenticated' — logged in as `user`
export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [guest, setGuest] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        setGuest(null);
        setStatus('authenticated');
        return;
      }
      setUser(null);
      const existingGuest = getGuestSession();
      if (existingGuest) {
        setGuest(existingGuest);
        setStatus('guest');
      } else {
        setStatus('signed-out');
      }
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      status,
      guest,
      user,
      continueAsGuest(displayName, role) {
        setGuest(startGuestSession(displayName, role));
        setStatus('guest');
      },
      async logIn(username, password) {
        await signIn(username, password);
        // onAuthChange fires and updates status/user.
      },
      async register(username, password) {
        // Returns the raw signUp() response so the caller can tell
        // whether it came back with an active session (email
        // confirmation off, as instructed) or not.
        return signUp(username, password);
      },
      async joinAsPlayer(displayName) {
        await signInAnonymously(displayName);
        // onAuthChange fires and updates status/user — same real account
        // path as logIn, just with no email/password (BIBLE.md §4).
      },
      async logOut() {
        clearGuestSession();
        setGuest(null);
        if (user) await accountSignOut();
        setStatus('signed-out');
      },
    }),
    [status, guest, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
