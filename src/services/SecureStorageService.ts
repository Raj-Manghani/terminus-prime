import Store from 'electron-store';
import crypto from 'crypto';
// import keytar from 'keytar'; // Remove keytar import

// Define a schema for electron-store (optional but good practice)
interface AppSchema {
  settings: {
    theme?: string;
    // Add other non-sensitive settings here
  };
  sessions?: string; // Encrypted session data as a single string blob
  // Store salt for password derivation (unique per installation)
  pbkdf2Salt?: string;
}

// const SERVICE_NAME = 'TerminusPrime';
// const KEYCHAIN_ACCOUNT = 'MasterEncryptionKey';
const PBKDF2_ITERATIONS = 100000; // Iterations for PBKDF2

class SecureStorageService {
  private store: Store<AppSchema>;
  private encryptionKey: Buffer | null = null; // Holds the master AES key (32 bytes)
  private keyInitialized: boolean = false;

  constructor() {
    this.store = new Store<AppSchema>({
      defaults: {
        settings: { theme: 'default-dark' },
        sessions: undefined,
        pbkdf2Salt: undefined, // Initialize salt if not present
      },
    });
    console.log('SecureStorageService initialized.');
  }

  // --- Key Management ---

  // Method 1: Derive key from master password using PBKDF2
  private deriveKeyFromPassword(password: string): Promise<Buffer> {
    console.log('Deriving encryption key from password using PBKDF2...');
    let saltHex = (this.store as any).get('pbkdf2Salt');
    let salt: Buffer;

    if (!saltHex) {
      console.log('No salt found, generating and storing a new one.');
      salt = crypto.randomBytes(16);
      (this.store as any).set('pbkdf2Salt', salt.toString('hex'));
    } else {
      salt = Buffer.from(saltHex, 'hex');
    }

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha512', (err, derivedKey) => {
        if (err) {
          console.error('PBKDF2 key derivation failed:', err);
          reject(err);
        } else {
          console.log('Key derived via PBKDF2.');
          resolve(derivedKey);
        }
      });
    });
  }

  // Method 2: Use OS Keychain (Commented out)
  /*
  private async getKeyFromKeychain(): Promise<Buffer | null> { ... }
  private async generateAndStoreKeyInKeychain(): Promise<Buffer> { ... }
  */

  // Initialize key using password derivation
  public async initializeEncryptionKey(password: string): Promise<boolean> {
    if (!password) {
        console.error("Master password is required for key initialization.");
        return false;
    }
    if (this.keyInitialized) return true;
    console.log('Initializing encryption key using password derivation...');
    try {
      const key = await this.deriveKeyFromPassword(password);
      this.encryptionKey = key;
      this.keyInitialized = true;
      console.log('Encryption key initialized successfully.');
      return true;
    } catch (error) {
      console.error('Failed to initialize encryption key:', error);
      this.keyInitialized = false;
      this.encryptionKey = null;
      return false;
    }
  }

  // --- Encryption/Decryption (Remains the same) ---

  public encryptData(data: string): string | null {
    if (!this.keyInitialized || !this.encryptionKey) {
      console.error('Encryption key not initialized.'); return null;
    }
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption failed:', error); return null;
    }
  }

  public decryptData(encryptedData: string): string | null {
    if (!this.keyInitialized || !this.encryptionKey) {
      console.error('Encryption key not initialized.'); return null;
    }
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) throw new Error('Invalid encrypted data format');
      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error); return null;
    }
  }

  // --- Session Data (Remains the same) ---

  public saveEncryptedSessions(sessions: any[]): void {
    if (!this.keyInitialized) {
       console.error("Cannot save sessions: encryption key not initialized."); return;
    }
    try {
      const sessionsToSave = sessions.map(({ password, ...rest }) => rest);
      const sessionsString = JSON.stringify(sessionsToSave);
      const encrypted = this.encryptData(sessionsString);
      if (encrypted) {
        (this.store as any).set('sessions', encrypted);
        console.log('Sessions saved and encrypted.');
      } else {
        console.error('Failed to encrypt sessions before saving.');
      }
    } catch (error) {
      console.error('Error saving sessions:', error);
    }
  }

  public loadDecryptedSessions(): any[] | null {
     if (!this.keyInitialized) {
       console.error("Cannot load sessions: encryption key not initialized."); return null;
    }
    try {
      const encryptedSessions = (this.store as any).get('sessions');
      if (!encryptedSessions) {
        console.log('No saved sessions found.'); return [];
      }
      const decryptedString = this.decryptData(encryptedSessions);
      if (decryptedString) {
        console.log('Sessions decrypted successfully.');
        return JSON.parse(decryptedString);
      } else {
        console.error('Failed to decrypt sessions.'); return null;
      }
    } catch (error) {
      console.error('Error loading sessions:', error); return null;
    }
  }

  // --- Settings (Remains the same) ---

  public getSettings(): AppSchema['settings'] {
    return (this.store as any).get('settings');
  }

  public setSettings(settings: AppSchema['settings']): void {
    (this.store as any).set('settings', settings);
  }

  public getThemeSetting(): string | undefined {
      const settings = (this.store as any).get('settings');
      return settings?.theme;
  }

  public setThemeSetting(theme: string): void {
      const currentSettings = (this.store as any).get('settings') || {};
      (this.store as any).set('settings', { ...currentSettings, theme });
  }
}

// Export a singleton instance
export const secureStorageService = new SecureStorageService();
