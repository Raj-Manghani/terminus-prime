import crypto from 'crypto';
import argon2 from 'argon2';
import keytar from 'keytar'; // keytar can be null if not available (e.g. optional dep or failed load)
import { app } from 'electron';

const ALGORITHM = 'aes-256-gcm';
const AES_IV_LENGTH = 12; // AES-GCM standard IV length is 12 bytes (96 bits)
const SALT_LENGTH = 16;   // For Argon2 salt
const KEY_LENGTH = 32;    // 256 bits for AES-256
const AUTH_TAG_LENGTH = 16; // AES-GCM auth tag is 128 bits (16 bytes)

const KEYTAR_SERVICE_NAME = app.name || 'TerminusPrimeApp'; // Use app.name if available
const KEYTAR_ACCOUNT_NAME = 'MasterEncryptionKey';

let masterKey: Buffer | null = null;
let masterKeyPromise: Promise<Buffer | null> | null = null;
let keytarSalt: Buffer | null = null; // To store salt if key is derived and then put into keytar with a new password

export interface EncryptedData {
  iv: string;       // hex encoded
  salt?: string;     // hex encoded, only if key was derived from password *for this specific data* (less common for master key pattern)
  encryptedText: string; // hex encoded (includes authTag)
}

export const SecureStorageService = {
  async _deriveKeyFromPassword(password: string, salt: Buffer): Promise<Buffer> {
    return argon2.hash(password, {
      salt: salt,
      type: argon2.argon2id,
      hashLength: KEY_LENGTH,
      timeCost: 3,
      memoryCost: 65536, // 64MB
      parallelism: 4,
      raw: true,
    });
  },

  async getMasterKey(masterPassword?: string, providedSaltHex?: string): Promise<Buffer | null> {
    if (masterKey) return masterKey;
    if (masterKeyPromise) return masterKeyPromise;

    masterKeyPromise = (async (): Promise<Buffer | null> => {
      try {
        if (keytar) {
          const storedKeyHex = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_NAME);
          if (storedKeyHex) {
            console.log('SecureStorage: Master key retrieved from keychain.');
            masterKey = Buffer.from(storedKeyHex, 'hex');
            // If we also stored a salt with keytar (e.g., salt for password that generated this keytar entry), retrieve it.
            // const storedSaltHex = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${KEYTAR_ACCOUNT_NAME}_salt`);
            // if (storedSaltHex) keytarSalt = Buffer.from(storedSaltHex, 'hex');
            return masterKey;
          }
        }
      } catch (error) {
        console.warn('SecureStorage: Keytar failed to retrieve master key:', error);
      }

      if (masterPassword) {
        console.log('SecureStorage: Deriving master key from provided password.');
        // This is where salt management is CRITICAL.
        // If decrypting, the salt must be the SAME as used during key generation for that password.
        // If providedSaltHex is given (e.g., from app config), use it.
        let saltToUse: Buffer;
        if (providedSaltHex) {
            saltToUse = Buffer.from(providedSaltHex, 'hex');
            console.log('SecureStorage: Using provided salt for key derivation.');
        } else if (keytarSalt) { // Salt associated with a keytar-stored, password-derived key
            saltToUse = keytarSalt;
            console.log('SecureStorage: Using keytar-associated salt for key derivation.');
        }
        else {
            // Fallback: This case implies we are deriving a key from a password without a known unique salt.
            // This is problematic for consistent key derivation unless the salt is fixed (BAD) or part of EncryptedData (uncommon for master key).
            // For initial setup or if salt is globally managed elsewhere, this might be okay.
            console.warn('SecureStorage: Deriving key from password without a provided unique salt. This may lead to issues if salt is not consistent.');
            // Using a fixed salt here to make it "work" for now, but this is a major simplification.
            // A real app needs a robust salt strategy (e.g. stored in app settings, or a global one if keytar is primary).
            saltToUse = Buffer.from('static-salt-must-be-replaced-in-prod', 'utf-8'); // Highly insecure placeholder
        }
        masterKey = await this._deriveKeyFromPassword(masterPassword, saltToUse);
        return masterKey;
      }

      console.warn('SecureStorage: Master key not in keychain and no master password provided for derivation.');
      return null;
    })().finally(() => {
      masterKeyPromise = null;
    });
    return masterKeyPromise;
  },

  async setMasterKeyWithPassword(password: string, storeInKeytar: boolean = true): Promise<{ success: boolean, saltHex?: string }> {
    const salt = crypto.randomBytes(SALT_LENGTH); // Generate a NEW, unique salt
    console.log('SecureStorage: Generating new salt for master key derivation.');
    masterKey = await this._deriveKeyFromPassword(password, salt);
    keytarSalt = salt; // Cache the salt used with this password-derived key

    if (storeInKeytar && keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_NAME, masterKey.toString('hex'));
        // Also store the salt if keytar is used, so it can be retrieved if needed for password changes/verification.
        // await keytar.setPassword(KEYTAR_SERVICE_NAME, `${KEYTAR_ACCOUNT_NAME}_salt`, salt.toString('hex'));
        console.log('SecureStorage: Master key derived and stored in keychain.');
        return { success: true, saltHex: salt.toString('hex') }; // Return salt so app can store it in its settings
      } catch (error) {
        console.error('SecureStorage: Keytar failed to store master key:', error);
        return { success: false, saltHex: salt.toString('hex') }; // Key in memory, salt available
      }
    } else {
      if (!keytar) console.warn('SecureStorage: Keytar not available.');
      console.warn('SecureStorage: Master key derived, in memory. Salt should be stored by caller if key not in keychain.');
      return { success: false, saltHex: salt.toString('hex') }; // Not persisted by keytar, return salt
    }
  },

  async generateAndStoreMasterKey(): Promise<boolean> {
    masterKey = crypto.randomBytes(KEY_LENGTH);
    keytarSalt = null; // This key is not derived from a password, so no salt needed for its own generation.
    if (keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_NAME, masterKey.toString('hex'));
        // await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${KEYTAR_ACCOUNT_NAME}_salt`); // Remove any old salt
        console.log('SecureStorage: New random master key generated and stored in keychain.');
        return true;
      } catch (error) {
        console.error('SecureStorage: Keytar failed to store newly generated master key:', error);
        return false;
      }
    }
    console.warn('SecureStorage: Keytar not available. New random master key is only in memory.');
    return false;
  },

  isMasterKeyAvailable(): boolean {
    return masterKey !== null;
  },

  clearInMemoryMasterKey(): void {
    masterKey = null;
    keytarSalt = null;
    console.log('SecureStorage: In-memory master key and associated salt cleared.');
  },

  async encrypt(text: string, key?: Buffer): Promise<EncryptedData | null> {
    const keyToUse = key || masterKey; // Allow passing a specific key, e.g. session key
    if (!keyToUse) {
      console.error('SecureStorage: Encryption failed - No master key available.');
      return null;
    }
    const iv = crypto.randomBytes(AES_IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyToUse, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
      iv: iv.toString('hex'),
      encryptedText: encrypted + authTag.toString('hex'),
    };
  },

  async decrypt(encryptedData: EncryptedData, key?: Buffer): Promise<string | null> {
    const keyToUse = key || masterKey;  // Allow passing a specific key
    if (!keyToUse) {
      console.error('SecureStorage: Decryption failed - No master key available.');
      return null;
    }
    if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedText) {
        console.error('SecureStorage: Decryption failed - Invalid encryptedData object.');
        return null;
    }
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const encryptedBuffer = Buffer.from(encryptedData.encryptedText, 'hex');
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(0, encryptedBuffer.length - AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, keyToUse, iv);
    decipher.setAuthTag(authTag);
    try {
      let decrypted = decipher.update(ciphertext, undefined, 'utf8'); // Input is buffer
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('SecureStorage: Decryption failed (tampered data, wrong key, or incorrect IV/authTag).', error);
      return null;
    }
  },

  async checkKeytarStatus(): Promise<'available' | 'unavailable' | 'error'> {
    if (!keytar) {
      console.warn('SecureStorage: Keytar module not loaded (likely optional or failed import).');
      return 'unavailable';
    }
    try {
      const testService = `${KEYTAR_SERVICE_NAME}_KeytarTest`;
      const testAccount = 'StatusCheck';
      await keytar.setPassword(testService, testAccount, 'test');
      await keytar.deletePassword(testService, testAccount);
      console.log('SecureStorage: Keytar is available and functional.');
      return 'available';
    } catch (error) {
      console.warn('SecureStorage: Keytar test operation failed. May not be available/functional:', error);
      return 'error';
    }
  }
};

// Optional: Perform a Keytar status check when the module loads.
// This helps in early diagnosis during development or app startup.
// (async () => {
//   if (app.isReady()) { // Ensure app is ready before using app.name or other app properties
//     await SecureStorageService.checkKeytarStatus();
//   } else {
//     app.on('ready', () => SecureStorageService.checkKeytarStatus());
//   }
// })();
