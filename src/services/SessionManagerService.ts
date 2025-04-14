import { SessionProfile } from '../components/SessionManager'; // Assuming SessionProfile is exported here
import { secureStorageService } from './SecureStorageService';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Define the shape of a stored session (without runtime password)
interface StoredSessionProfile extends Omit<SessionProfile, 'password'> {}

class SessionManagerService {
  private sessions: StoredSessionProfile[] = [];

  constructor() {
    // Load sessions on initialization
    // Note: initializeEncryptionKey needs to be called *before* this
    // We'll handle the async initialization later in main.ts
    // For now, assume key is initialized for structure
    // this.loadSessions();
    console.log('SessionManagerService initialized.');
  }

  // Should be called after encryption key is ready
  public async loadSessions(): Promise<void> {
    console.log('SessionManagerService: Loading sessions...');
    const loadedSessions = await secureStorageService.loadDecryptedSessions();
    if (loadedSessions) {
      this.sessions = loadedSessions;
      console.log(`Loaded ${this.sessions.length} sessions.`);
    } else {
      console.log('Failed to load sessions or no sessions found.');
      this.sessions = [];
    }
  }

  private saveSessions(): void {
    console.log('SessionManagerService: Saving sessions...');
    secureStorageService.saveEncryptedSessions(this.sessions);
  }

  public getSessions(): StoredSessionProfile[] {
    // Return a copy to prevent direct modification
    return [...this.sessions];
  }

  public addSession(sessionData: Omit<StoredSessionProfile, 'id'>): StoredSessionProfile {
    const newSession: StoredSessionProfile = {
      ...sessionData,
      id: uuidv4(), // Generate a unique ID
    };
    this.sessions.push(newSession);
    this.saveSessions();
    console.log('Session added:', newSession);
    return newSession;
  }

  public updateSession(updatedSession: StoredSessionProfile): boolean {
    const index = this.sessions.findIndex(s => s.id === updatedSession.id);
    if (index !== -1) {
      this.sessions[index] = updatedSession;
      this.saveSessions();
      console.log('Session updated:', updatedSession);
      return true;
    }
    console.log('Session update failed: ID not found', updatedSession.id);
    return false;
  }

  public deleteSession(sessionId: string): boolean {
    const initialLength = this.sessions.length;
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.sessions.length < initialLength) {
      this.saveSessions();
      console.log('Session deleted:', sessionId);
      return true;
    }
    console.log('Session delete failed: ID not found', sessionId);
    return false;
  }
}

// Export a singleton instance
export const sessionManagerService = new SessionManagerService();
