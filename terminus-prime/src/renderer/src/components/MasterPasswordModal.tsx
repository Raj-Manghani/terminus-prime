import React, { useState } from 'react';

interface MasterPasswordModalProps {
  isOpen: boolean;
  onClose?: () => void; // Optional: parent might control visibility strictly via master key status
  onPasswordSubmit: (password: string) => Promise<boolean | { success: boolean, saltHex?: string }>; // Updated return type
  message?: string;
  isSettingNewPassword?: boolean; // Hint for button text
}

const MasterPasswordModal: React.FC<MasterPasswordModalProps> = ({
  isOpen,
  onClose, // Not used if parent controls visibility strictly
  onPasswordSubmit,
  message,
  isSettingNewPassword
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password) {
      setError('Password cannot be empty.');
      return;
    }
    if (isSettingNewPassword && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await onPasswordSubmit(password);
      const success = typeof result === 'boolean' ? result : result.success;

      if (success) {
        setPassword('');
        setConfirmPassword('');
        // Parent will likely control visibility based on master key status / appUnlocked state
      } else {
        setError('Failed to set/verify master key. Incorrect password or a system error occurred.');
      }
    } catch (err: any) {
      console.error("Error submitting master password:", err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        backgroundColor: '#2c2c2e', color: 'white', padding: '30px',
        borderRadius: '12px', boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
        width: '380px', textAlign: 'center'
      }}>
        <h2 style={{marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px'}}>
          {isSettingNewPassword ? 'Set Master Password' : 'Master Password Required'}
        </h2>
        <p style={{fontSize: '0.95em', color: '#ccc', marginBottom: '20px'}}>{message || 'Please enter your master password.'}</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master Password"
            disabled={isLoading}
            style={{ padding: '12px', marginBottom: isSettingNewPassword ? '15px' : '20px', width: 'calc(100% - 24px)', borderRadius: '6px', border: '1px solid #555', backgroundColor: '#3a3a3c', color: 'white', fontSize: '1em' }}
          />
          {isSettingNewPassword && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Master Password"
              disabled={isLoading}
              style={{ padding: '12px', marginBottom: '20px', width: 'calc(100% - 24px)', borderRadius: '6px', border: '1px solid #555', backgroundColor: '#3a3a3c', color: 'white', fontSize: '1em' }}
            />
          )}
          {error && <p style={{ color: '#ff6b6b', fontSize: '0.9em', marginBottom: '15px' }}>{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '12px 25px', cursor: 'pointer',
              backgroundColor: isLoading? '#4cae4c' : '#5cb85c',
              color: 'white', border: 'none', borderRadius: '6px', fontSize: '1em', width: '100%'
            }}
          >
            {isLoading ? (isSettingNewPassword ? 'Setting...' : 'Unlocking...') : (isSettingNewPassword ? 'Set Password' : 'Unlock')}
          </button>
        </form>
        {/* Optional Cancel Button - might not be appropriate if modal is blocking critical action
        {onClose && !isSettingNewPassword && ( // Example: only show cancel if not setting new password initially
          <button onClick={onClose} style={{marginTop: '15px', background: 'none', border: '1px solid #555', color: '#aaa', cursor: 'pointer', padding: '8px 15px', borderRadius: '6px'}}>
            Cancel
          </button>
        )}
        */}
      </div>
    </div>
  );
};

export default MasterPasswordModal;
