import React, { useState, useEffect } from 'react';
import { StoredSessionProfile } from './SessionManager'; // Import the stored type

interface AddEditSessionModalProps {
  sessionToEdit?: StoredSessionProfile | null; // Optional session for editing
  onClose: () => void;
  onSave: (sessionData: Omit<StoredSessionProfile, 'id'>) => Promise<void>; // Function to call IPC handler
}

const AddEditSessionModal: React.FC<AddEditSessionModalProps> = ({
  sessionToEdit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number | ''>(22);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!sessionToEdit;

  useEffect(() => {
    if (isEditing && sessionToEdit) {
      setName(sessionToEdit.name);
      setHost(sessionToEdit.host);
      setPort(sessionToEdit.port);
      setUsername(sessionToEdit.username);
    }
  }, [sessionToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    if (!name || !host || !port || !username) {
      setError('All fields are required.');
      setIsSaving(false);
      return;
    }

    const sessionData: Omit<StoredSessionProfile, 'id'> = {
      name,
      host,
      port: Number(port), // Ensure port is a number
      username,
    };

    try {
      // Here we would call the appropriate IPC handler (add or update)
      // For now, we only implement add via onSave prop
      if (isEditing) {
        // TODO: Implement update logic (needs session ID)
        console.warn("Update functionality not implemented yet.");
      } else {
        await onSave(sessionData);
      }
      onClose(); // Close modal on successful save
    } catch (err) {
      console.error('Error saving session:', err);
      setError('Failed to save session. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>{isEditing ? 'Edit Session' : 'Add New Session'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label htmlFor="session-name" style={styles.label}>Name:</label>
            <input
              type="text"
              id="session-name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={styles.input}
              required
              autoFocus={!isEditing}
            />
          </div>
          <div style={styles.formGroup}>
            <label htmlFor="session-host" style={styles.label}>Host:</label>
            <input
              type="text"
              id="session-host"
              value={host}
              onChange={e => setHost(e.target.value)}
              style={styles.input}
              required
              placeholder="e.g., 192.168.1.100 or example.com"
            />
          </div>
          <div style={styles.formGroup}>
            <label htmlFor="session-port" style={styles.label}>Port:</label>
            <input
              type="number"
              id="session-port"
              value={port}
              onChange={e => setPort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              style={styles.input}
              required
              min="1"
              max="65535"
            />
          </div>
          <div style={styles.formGroup}>
            <label htmlFor="session-username" style={styles.label}>Username:</label>
            <input
              type="text"
              id="session-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.buttonGroup}>
            <button type="button" onClick={onClose} style={styles.buttonCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" style={styles.buttonSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Session')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Basic inline styles for the modal
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#2d323b',
    padding: '2rem',
    borderRadius: '8px',
    color: '#d4d4d4',
    minWidth: '400px',
    maxWidth: '90%',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
  },
  title: {
    marginTop: 0,
    marginBottom: '1.5rem',
    textAlign: 'center',
    color: '#fff',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  input: {
    padding: '0.6rem',
    borderRadius: '4px',
    border: '1px solid #444',
    backgroundColor: '#3c414a',
    color: '#d4d4d4',
    fontSize: '1rem',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '1rem',
    marginTop: '1rem',
  },
  button: {
    padding: '0.6rem 1.2rem',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
  },
  buttonCancel: {
    backgroundColor: '#555',
    color: '#fff',
    padding: '0.6rem 1.2rem',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
  },
  buttonSave: {
    backgroundColor: '#0078d4',
    color: '#fff',
    padding: '0.6rem 1.2rem',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
  },
  error: {
    color: '#ff4d4d',
    textAlign: 'center',
    marginTop: '0.5rem',
  },
};

export default AddEditSessionModal;
