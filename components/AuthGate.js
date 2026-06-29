import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
            }
          }
        });

        if (error) throw error;
        
        alert("Verification email sent! Please check your inbox (or spam) to confirm your account and log in.");
        setIsSignUp(false);
      } else {
        // Sign In flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data.session) {
          onAuthSuccess(data.session);
        }
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setErrorMsg(err.message || "An authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" style={{ position: 'relative', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal" style={{ width: '100%', maxWidth: '400px', transform: 'scale(1)', margin: '1rem' }}>
        <div className="modal-header" style={{ justifyContent: 'center', borderBottom: '1px solid var(--border-glass)' }}>
          <div className="logo" style={{ fontSize: '1.65rem' }}>
            <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '32px', height: '32px' }}>
              <path d="M12,7.5c-0.5,0-0.9-0.4-1.2-0.8c-0.7-1.1-1.5-2.2-2.3-3.2c-0.1-0.2-0.3-0.2-0.5-0.1c-0.2,0.1-0.2,0.3-0.1,0.5c0.7,1.4,1,2.8,1,4.4c0,0.4-0.1,0.7-0.4,1c-1.8,1.8-4.2,2.5-6.7,2.2c-0.3,0-0.6,0.2-0.7,0.5c-0.1,0.3,0.1,0.6,0.3,0.7c2.5,1.2,4.8,2.7,6.7,4.8c0.2,0.2,0.4,0.3,0.7,0.3c0.7,0.1,1.1,0.7,1.5,1.2c0.7,1,1.5,1.9,2.4,2.7c0.2,0.2,0.5,0.2,0.7,0c0.9-0.8,1.7-1.7,2.4-2.7c0.4-0.5,0.8-1.1,1.5-1.2c0.3,0,0.5-0.1,0.7-0.3c1.9-2.1,4.2-3.6,6.7-4.8c0.2-0.1,0.4-0.4,0.3-0.7c-0.1-0.3-0.4-0.5-0.7-0.5c-2.5,0.3-4.9-0.4-6.7-2.2c-0.3-0.3-0.4-0.6-0.4-1c0-1.6,0.3-3,1-4.4c0.1-0.2,0-0.4-0.1-0.5c-0.2-0.1-0.4-0.1-0.5,0.1c-0.8,1-1.6,2.1-2.3,3.2C12.9,7.1,12.5,7.5,12,7.5z" fill="url(#gradient-accent-auth)"/>
              <defs>
                <linearGradient id="gradient-accent-auth" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#ffe600"/>
                  <stop offset="1" stop-color="#b58500"/>
                </linearGradient>
              </defs>
            </svg>
            <span>{isSignUp ? 'REGISTER BATMAN NODE' : 'BATCOMPUTER UPLINK'}</span>
          </div>
        </div>

        <form onSubmit={handleAuth} className="modal-body">
          {errorMsg && (
            <div className="info-alert" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span className="alert-icon" style={{ color: 'var(--accent-red)' }}>⚠️</span>
              <div className="alert-text" style={{ color: '#fca5a5' }}>{errorMsg}</div>
            </div>
          )}

          {isSignUp && (
            <div className="form-group">
              <label htmlFor="username">Node Alias (Username)</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Agent_Robin"
                required
                autoComplete="off"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Uplink Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="bruce@wayne.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Access Code (Password)</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }} disabled={loading}>
            {loading ? 'Processing Cryptographic Access...' : (isSignUp ? 'Initialize Node Credentials' : 'Secure Authorization')}
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            {isSignUp ? (
              <>Already registered? <span onClick={() => setIsSignUp(false)} style={{ color: 'var(--accent-yellow)', cursor: 'pointer', fontWeight: 'bold' }}>Authorize Uplink</span></>
            ) : (
              <>New agent? <span onClick={() => setIsSignUp(true)} style={{ color: 'var(--accent-yellow)', cursor: 'pointer', fontWeight: 'bold' }}>Register Node</span></>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
