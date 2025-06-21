import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { SecureStorageService, EncryptedData } from './secureStorageService';

export interface SessionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key' | 'agent';
  password?: string;
  privateKeyPath?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSessionProfile {
  id: string;
  name: EncryptedData | string; // Allow name to be optionally unencrypted for easier display if needed
  host: EncryptedData;
  port: EncryptedData;
  username: EncryptedData;
  authMethod: EncryptedData;
  password?: EncryptedData;
  privateKeyPath?: EncryptedData;
  notes?: EncryptedData;
  createdAt: EncryptedData;
  updatedAt: EncryptedData;
}

const SESSIONS_FILE_NAME = 'terminus-prime-sessions.enc.json'; // Indicate encrypted content
const sessionsFilePath = path.join(app.getPath('userData'), SESSIONS_FILE_NAME);

let sessionsCache: SessionProfile[] | null = null;

export const SessionManagerService = {
  async _encryptProfile(profile: SessionProfile, masterKey: Buffer): Promise<StoredSessionProfile | null> {
    // Encrypt all fields, name is also encrypted for full privacy here.
    const nameEnc = await SecureStorageService.encrypt(profile.name, masterKey);
    const hostEnc = await SecureStorageService.encrypt(profile.host, masterKey);
    const portEnc = await SecureStorageService.encrypt(profile.port.toString(), masterKey);
    const usernameEnc = await SecureStorageService.encrypt(profile.username, masterKey);
    const authMethodEnc = await SecureStorageService.encrypt(profile.authMethod, masterKey);
    const createdAtEnc = await SecureStorageService.encrypt(profile.createdAt, masterKey);
    const updatedAtEnc = await SecureStorageService.encrypt(profile.updatedAt, masterKey);

    if (!nameEnc || !hostEnc || !portEnc || !usernameEnc || !authMethodEnc || !createdAtEnc || !updatedAtEnc) {
      console.error("SessionManager: Failed to encrypt one or more mandatory profile fields.");
      return null;
    }

    const storedProfile: StoredSessionProfile = {
      id: profile.id,
      name: nameEnc, host: hostEnc, port: portEnc, username: usernameEnc,
      authMethod: authMethodEnc, createdAt: createdAtEnc, updatedAt: updatedAtEnc,
    };

    if (profile.password) {
      const passwordEnc = await SecureStorageService.encrypt(profile.password, masterKey);
      if (!passwordEnc) { console.error("SessionManager: Password encryption failed."); return null; }
      storedProfile.password = passwordEnc;
    }
    if (profile.privateKeyPath) {
      const pkPathEnc = await SecureStorageService.encrypt(profile.privateKeyPath, masterKey);
      if (!pkPathEnc) { console.error("SessionManager: Private key path encryption failed."); return null; }
      storedProfile.privateKeyPath = pkPathEnc;
    }
    if (profile.notes) {
      const notesEnc = await SecureStorageService.encrypt(profile.notes, masterKey);
      if (!notesEnc) { console.error("SessionManager: Notes encryption failed."); return null; }
      storedProfile.notes = notesEnc;
    }
    return storedProfile;
  },

  async _decryptProfile(storedProfile: StoredSessionProfile, masterKey: Buffer): Promise<SessionProfile | null> {
    let nameDec: string | null;
    if (typeof storedProfile.name === 'string') { // Handle if name was stored unencrypted (legacy or choice)
        nameDec = storedProfile.name;
    } else {
        nameDec = await SecureStorageService.decrypt(storedProfile.name, masterKey);
    }
    const hostDec = await SecureStorageService.decrypt(storedProfile.host, masterKey);
    const portStrDec = await SecureStorageService.decrypt(storedProfile.port, masterKey);
    const usernameDec = await SecureStorageService.decrypt(storedProfile.username, masterKey);
    const authMethodDec = await SecureStorageService.decrypt(storedProfile.authMethod, masterKey) as SessionProfile['authMethod'] | null;
    const createdAtDec = await SecureStorageService.decrypt(storedProfile.createdAt, masterKey);
    const updatedAtDec = await SecureStorageService.decrypt(storedProfile.updatedAt, masterKey);

    if (nameDec === null || hostDec === null || portStrDec === null || usernameDec === null || authMethodDec === null || createdAtDec === null || updatedAtDec === null) {
      console.error(`SessionManager: Failed to decrypt one or more mandatory fields for profile ID ${storedProfile.id}.`);
      return null;
    }

    const profile: SessionProfile = {
      id: storedProfile.id, name: nameDec, host: hostDec, port: parseInt(portStrDec, 10),
      username: usernameDec, authMethod: authMethodDec, createdAt: createdAtDec, updatedAt: updatedAtDec,
    };

    if (storedProfile.password) {
      const passwordDec = await SecureStorageService.decrypt(storedProfile.password, masterKey);
      if (passwordDec === null) { console.error(`SessionManager: Password decryption failed for profile ID ${storedProfile.id}.`); return null; }
      profile.password = passwordDec;
    }
    if (storedProfile.privateKeyPath) {
      const pkPathDec = await SecureStorageService.decrypt(storedProfile.privateKeyPath, masterKey);
      if (pkPathDec === null) { console.error(`SessionManager: Private key path decryption failed for profile ID ${storedProfile.id}.`); return null; }
      profile.privateKeyPath = pkPathDec;
    }
    if (storedProfile.notes) {
      const notesDec = await SecureStorageService.decrypt(storedProfile.notes, masterKey);
      if (notesDec === null) { console.error(`SessionManager: Notes decryption failed for profile ID ${storedProfile.id}.`); return null; }
      profile.notes = notesDec;
    }
    return profile;
  },

  async _loadStoredSessionsFromFile(): Promise<StoredSessionProfile[]> {
    try {
      if (await fs.pathExists(sessionsFilePath)) {
        const fileContent = await fs.readFile(sessionsFilePath, 'utf-8');
        if (fileContent.trim() === "") return []; // Handle empty file
        return JSON.parse(fileContent) as StoredSessionProfile[];
      }
      return [];
    } catch (error) {
      console.error('SessionManager: Error loading sessions file:', error);
      await fs.ensureDir(path.dirname(sessionsFilePath)); // Ensure directory exists
      await fs.writeFile(sessionsFilePath, JSON.stringify([], null, 2)); // Create empty valid file
      return [];
    }
  },

  async _saveStoredSessionsToFile(profiles: StoredSessionProfile[]): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(sessionsFilePath));
      await fs.writeFile(sessionsFilePath, JSON.stringify(profiles, null, 2));
      sessionsCache = null; // Invalidate cache
      return true;
    } catch (error) {
      console.error('SessionManager: Error saving sessions file:', error);
      return false;
    }
  },

  async getAllSessions(): Promise<SessionProfile[]> {
    if (sessionsCache) return sessionsCache;

    const masterKey = await SecureStorageService.getMasterKey(); // Pass password if needed, or ensure it's set
    if (!masterKey) {
      console.warn("SessionManager: Master key not available. Cannot load/decrypt sessions.");
      return [];
    }

    const storedProfiles = await this._loadStoredSessionsFromFile();
    const decryptedProfiles: SessionProfile[] = [];
    for (const sp of storedProfiles) {
      const profile = await this._decryptProfile(sp, masterKey);
      if (profile) {
        decryptedProfiles.push(profile);
      } else {
        console.warn(`SessionManager: Failed to decrypt session ID: ${sp.id}.`);
      }
    }
    sessionsCache = decryptedProfiles;
    return decryptedProfiles;
  },

  async getSessionById(id: string): Promise<SessionProfile | undefined> {
    const sessions = await this.getAllSessions(); // Relies on getAllSessions to handle master key
    return sessions.find(s => s.id === id);
  },

  async addSession(profileData: Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionProfile | null> {
    const masterKey = await SecureStorageService.getMasterKey();
    if (!masterKey) {
      console.error("SessionManager: Master key not available. Cannot add session.");
      return null;
    }
    const now = new Date().toISOString();
    const newProfile: SessionProfile = {
      ...profileData, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    };

    const encryptedProfile = await this._encryptProfile(newProfile, masterKey);
    if (!encryptedProfile) return null;

    const storedProfiles = await this._loadStoredSessionsFromFile();
    storedProfiles.push(encryptedProfile);
    const success = await this._saveStoredSessionsToFile(storedProfiles);
    return success ? newProfile : null;
  },

  async updateSession(id: string, updates: Partial<Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SessionProfile | null> {
    const masterKey = await SecureStorageService.getMasterKey();
    if (!masterKey) {
      console.error("SessionManager: Master key not available. Cannot update session.");
      return null;
    }
    let storedProfiles = await this._loadStoredSessionsFromFile();
    const profileIndex = storedProfiles.findIndex(p => p.id === id);

    if (profileIndex === -1) return null;

    const existingDecrypted = await this._decryptProfile(storedProfiles[profileIndex], masterKey);
    if (!existingDecrypted) return null;

    const updatedProfileData: SessionProfile = {
        ...existingDecrypted, ...updates, updatedAt: new Date().toISOString(),
    };

    const newlyEncryptedProfile = await this._encryptProfile(updatedProfileData, masterKey);
    if (!newlyEncryptedProfile) return null;

    storedProfiles[profileIndex] = newlyEncryptedProfile;
    const success = await this._saveStoredSessionsToFile(storedProfiles);
    return success ? updatedProfileData : null;
  },

  async deleteSession(id: string): Promise<boolean> {
    // Master key check is implicitly handled by _load and _save through getAllSessions if cache is empty.
    // However, direct load/save here is better.
    const masterKey = await SecureStorageService.getMasterKey();
     if (!masterKey) {
      console.error("SessionManager: Master key not available. Cannot delete session.");
      return false;
    }
    let storedProfiles = await this._loadStoredSessionsFromFile();
    const initialLength = storedProfiles.length;
    storedProfiles = storedProfiles.filter(p => p.id !== id);
    if (storedProfiles.length === initialLength) return false;
    return this._saveStoredSessionsToFile(storedProfiles);
  },

  invalidateCache(): void {
    sessionsCache = null;
    console.log("SessionManager: In-memory session cache invalidated.");
  }
};

// Consider how SecureStorageService events (like master key cleared) would trigger invalidateCache.
// This might involve SecureStorageService becoming an EventEmitter or providing callbacks.
