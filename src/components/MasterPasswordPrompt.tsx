import React, { useState } from 'react';

interface MasterPasswordPromptProps {
  onUnlock: (password: string) => Promise<boolean>; // Returns true on success, false on failure
  initialError?: string | null;
}

const MasterPasswordPrompt: React.FC<MasterPasswordPromptProps> = ({ onUnlock, initialError }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isLoading) return;

    setIsLoading(true);
    setError(null);

    const success = await onUnlock(password);

    if (!success) {
      setError('Incorrect password or failed to initialize storage. Please try again.');
      setPassword(''); // Clear password field on failure
    }
    // On success, the parent component will hide this prompt

    setIsLoading(false);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Enter Master Password</h2>
        <p style={styles.subtitle}>Enter your master password to unlock Terminus Prime.</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={styles.input}
            placeholder="Master Password"
            disabled={isLoading}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.buttonUnlock} disabled={isLoading || !password}>
            {isLoading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
         {/* TODO: Add link/button for "Forgot Password?" or reset functionality later */}
      </div>
    </div>
  );
};

// Styles similar to AddEditSessionModal
const styles: { [key: string]: React.CSSProperties } = {
   overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  },
  modal: {
    background: '#23272e', padding: '2.5rem', borderRadius: '8px',
    color: '#d4d4d4', minWidth: '350px', maxWidth: '90%',
    boxShadow: '0 5px 20px rgba(0,0,0,0.4)', textAlign: 'center',
  },
  title: {
    marginTop: 0, marginBottom: '0.5rem', color: '#fff', fontSize: '1.5rem',
  },
   subtitle: {
    marginBottom: '1.5rem', color: '#aaa', fontSize: '0.95rem',
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: '1rem',
  },
  input: {
    padding: '0.8rem', borderRadius: '4px', border: '1px solid #444',
    backgroundColor: '#3c414a', color: '#d4d4d4', fontSize: '1.1rem',
    textAlign: 'center',
  },
  buttonUnlock: {
    backgroundColor: '#0078d4', color: '#fff', padding: '0.8rem 1.5rem',
    borderRadius: '4px', border: 'none', cursor: 'pointer',
    fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem',
    opacity: 1,
    transition: 'opacity 0.2s ease',
  },
  // Add disabled style if needed: buttonUnlock:disabled { opacity: 0.6; cursor: not-allowed; }
  error: {
    color: '#ff6b6b', marginTop: '0.5rem', fontSize: '0.9rem',
  },
};

export default MasterPasswordPrompt;
