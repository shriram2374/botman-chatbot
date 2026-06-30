'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AuthGate from '@/components/AuthGate';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active auth session on load
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } catch (err) {
        console.error("Session fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Subscribe to authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#060609',
        color: 'var(--accent-yellow)',
        fontFamily: 'var(--font-sans)'
      }}>
        {/* Glowing Bat-Signal Loading Indicator */}
        <svg style={{
          width: '60px',
          height: '60px',
          animation: 'pulse 1.5s infinite alternate ease-in-out',
          marginBottom: '1.5rem'
        }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12,7.5c-0.5,0-0.9-0.4-1.2-0.8c-0.7-1.1-1.5-2.2-2.3-3.2c-0.1-0.2-0.3-0.2-0.5-0.1c-0.2,0.1-0.2,0.3-0.1,0.5c0.7,1.4,1,2.8,1,4.4c0,0.4-0.1,0.7-0.4,1c-1.8,1.8-4.2,2.5-6.7,2.2c-0.3,0-0.6,0.2-0.7,0.5c-0.1,0.3,0.1,0.6,0.3,0.7c2.5,1.2,4.8,2.7,6.7,4.8c0.2,0.2,0.4,0.3,0.7,0.3c0.7,0.1,1.1,0.7,1.5,1.2c0.7,1,1.5,1.9,2.4,2.7c0.2,0.2,0.5,0.2,0.7,0c0.9-0.8,1.7-1.7,2.4-2.7c0.4-0.5,0.8-1.1,1.5-1.2c0.3,0,0.5-0.1,0.7-0.3c1.9-2.1,4.2-3.6,6.7-4.8c0.2-0.1,0.4-0.4,0.3-0.7c-0.1-0.3-0.4-0.5-0.7-0.5c-2.5,0.3-4.9-0.4-6.7-2.2c-0.3-0.3-0.4-0.6-0.4-1c0-1.6,0.3-3,1-4.4c0.1-0.2,0-0.4-0.1-0.5c-0.2-0.1-0.4-0.1-0.5,0.1c-0.8,1-1.6,2.1-2.3,3.2C12.9,7.1,12.5,7.5,12,7.5z" fill="#ffcc00"/>
        </svg>
        <span style={{ fontSize: '0.9rem', letterSpacing: '2px', fontWeight: 600 }}>CALIBRATING ACCESS CHANNELS...</span>
      </div>
    );
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  if (!session) {
    return <AuthGate onAuthSuccess={(s) => setSession(s)} />;
  }

  return <Dashboard session={session} onSignOut={handleSignOut} />;
}
