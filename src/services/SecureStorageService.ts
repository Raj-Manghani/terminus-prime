import Store from 'electron-store';
import crypto from 'crypto';
// import keytar from 'keytar'; // Keytar removed

// Define a schema for electron-store
interface AppSchema {
  settings: {
    theme?: string;
  };
  sessions?: string; // Encrypted session data
  pbkdf2Salt?: string; // Salt for key derivation
  encryptionCheck?: string; // Encrypted check string to verify password
}

const PBKDF2_ITERATIONS = 100000;
const ENCRYPTION_CHECK_PLAINTEXT = "TERMINUS_PRIME_CHECK_STRING_v1"; // Constant string for verification

class SecureStorageService {
  private store: Store<AppSchema>;
  private encryptionKey: Buffer | null = null;
  private keyInitialized: boolean = false;

  constructor() {
    this.store = new Store<AppSchema>({
      defaults: {
        settings: { theme: 'default-dark' },
        sessions: undefined,
        pbkdf2Salt: undefined,
        encryptionCheck: undefined,
      },
    });
    console.log('SecureStorageService initialized.');
  }

  // --- Key Management ---

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

  // Initialize and *verify* key using password derivation and check string
  public async initializeEncryptionKey(password: string): Promise<boolean> {
    if (!password) {
      console.error("Master password is required for key initialization.");
      return false;
    }
    // Don't return early if already initialized, always verify password attempt
    // if (this.keyInitialized) return true;

    console.log('Initializing and verifying encryption key using password...');
    let derivedKey: Buffer;
    try {
      derivedKey = await this.deriveKeyFromPassword(password);
    } catch (error) {
      console.error('Failed to derive encryption key:', error);
      this.keyInitialized = false;
      this.encryptionKey = null;
      return false; // Derivation failed
    }

    // --- Verification Step ---
    const storedCheck = (this.store as any).get('encryptionCheck');
    let currentKeyIsValid = false;

    if (storedCheck) {
      // Attempt to decrypt the check string with the derived key
      console.log('Found existing encryption check string. Verifying password...');
      const decryptedCheck = this.decryptDataInternal(storedCheck, derivedKey); // Use internal decrypt that takes key
      if (decryptedCheck === ENCRYPTION_CHECK_PLAINTEXT) {
        console.log('Password verified successfully.');
        currentKeyIsValid = true;
      } else {
        console.warn('Password verification failed: Decrypted check string does not match.');
        // Do not set the key or initialized status
      }
    } else {
      // First run (or check string missing) - Assume password is correct for the first time
      console.log('No encryption check string found. Assuming first run or reset.');
      const newCheckEncrypted = this.encryptDataInternal(ENCRYPTION_CHECK_PLAINTEXT, derivedKey); // Use internal encrypt
      if (newCheckEncrypted) {
        (this.store as any).set('encryptionCheck', newCheckEncrypted);
        console.log('Stored new encryption check string.');
        currentKeyIsValid = true; // Trust the first password
      } else {
        console.error('Failed to encrypt initial check string!');
        // Key derivation worked, but encrypt failed - critical error
      }
    }

    // Set state only if verification passed
    if (currentKeyIsValid) {
      this.encryptionKey = derivedKey;
      this.keyInitialized = true;
      console.log('Encryption key initialized and verified.');
      return true;
    } else {
      this.encryptionKey = null;
      this.keyInitialized = false;
      console.error('Password verification failed.');
      return false;
    }
  }

  // --- Encryption/Decryption ---

  // Internal version for check string, taking key directly
  private encryptDataInternal(data: string, key: Buffer): string | null {
     if (!key) { console.error('Internal Encrypt: No key provided.'); return null; }
     try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
     } catch (error) {
        console.error('Internal Encryption failed:', error); return null;
     }
  }

  // Internal version for check string, taking key directly
  private decryptDataInternal(encryptedData: string, key: Buffer): string | null {
     if (!key) { console.error('Internal Decrypt: No key provided.'); return null; }
     try {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) throw new Error('Invalid encrypted data format');
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
     } catch (error) {
        // Decryption errors are expected with wrong key, less verbose logging
        // console.error('Internal Decryption failed:', error);
        return null;
     }
  }

  // Public versions use the initialized instance key
  public encryptData(data: string): string | null {
    if (!this.keyInitialized || !this.encryptionKey) {
      console.error('Encrypt Error: Key not initialized.'); return null;
    }
    return this.encryptDataInternal(data, this.encryptionKey);
  }

  public decryptData(encryptedData: string): string | null {
    if (!this.keyInitialized || !this.encryptionKey) {
      console.error('Decrypt Error: Key not initialized.'); return null;
    }
    return this.decryptDataInternal(encryptedData, this.encryptionKey);
  }

  // --- Session Data ---

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
      // Decryption now implicitly verifies the key is correct for this data
      const decryptedString = this.decryptData(encryptedSessions);
      if (decryptedString) {
        console.log('Sessions decrypted successfully.');
        return JSON.parse(decryptedString);
      } else {
        console.error('Failed to decrypt sessions (likely wrong key/password).');
        return null; // Indicate failure
      }
    } catch (error) {
      console.error('Error loading sessions:', error); return null;
    }
  }

  // --- Settings ---

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
