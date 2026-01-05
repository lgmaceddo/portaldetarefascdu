import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { Session } from '@supabase/supabase-js';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'doctor' | 'reception';
  avatar?: string;
  specialty?: string;
  status?: 'online' | 'offline';
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  // We keep these for compatibility but they will now trigger Supabase actions internally or be used by the Login page directly
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  updateStatus: (status: 'online' | 'offline') => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the user's profile from the 'profiles' table
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      } else if (data) {
        setUser(data as User);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    }
  };

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  const logout = async () => {
    // Set status to offline before logging out
    if (user?.id) {
      await supabase.from('profiles').update({ status: 'offline' }).eq('id', user.id);
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const updateStatus = async (status: 'online' | 'offline') => {
    if (user && user.id) {
      // Optimistic update
      setUser({ ...user, status });

      // DB update
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating status:', error);
        // Revert on error if needed, but for status it might be fine to just log
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      refreshProfile,
      logout,
      updateStatus,
      isAuthenticated: !!session?.user, // Relies on session being present
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};