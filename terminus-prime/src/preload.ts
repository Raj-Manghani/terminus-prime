import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Structures from main process for type safety.
// In a monorepo or with shared types, these could be imported directly.
export interface SessionProfile {
  id: string; name: string; host: string; port: number; username: string;
  authMethod: 'password' | 'key' | 'agent';
  password?: string; privateKeyPath?: string; notes?: string;
  createdAt: string; updatedAt: string;
}
export type SessionProfileCreateData = Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>;
export type SessionProfileUpdateData = Partial<SessionProfileCreateData>;

// For master key setting response
export interface SetMasterKeyResult {
  success: boolean;
  saltHex?: string; // Returned if keytar storage fails but derivation succeeds
}


// --- SSH Service related types (assuming they were defined similarly or inline) ---
export interface SshConnectionArgs { host: string; port: number; username: string; password?: string; }
export interface SshStatusArgs { windowId: number; status: string; message: string; } // Matched to existing ssh:status
export interface SshDataIPCArgs { windowId: number; data: string; } // Matched to existing ssh:data
export interface SshResizeArgs { cols: number; rows: number; height: number; width: number; }

export interface ElectronAPI {
  // SSH Service
  onSshData: (callback: (data: string) => void) => (() => void);
  onSshStatus: (callback: (status: SshStatusArgs) => void) => (() => void);
  sshConnect: (args: SshConnectionArgs) => void;
  sshDisconnect: () => void;
  sshSendData: (data: string) => void;
  sshResize: (args: SshResizeArgs) => void;
  pingSsh: () => void; // Renamed from 'ping' to avoid conflict if generic ping exists

  // Session Management
  loadSessions: () => Promise<SessionProfile[]>;
  getSessionById: (id: string) => Promise<SessionProfile | undefined>;
  addSession: (profileData: SessionProfileCreateData) => Promise<SessionProfile | null>;
  updateSession: (id: string, updates: SessionProfileUpdateData) => Promise<SessionProfile | null>;
  deleteSession: (id: string) => Promise<boolean>;

  // SecureStorage / Master Key
  isMasterKeySet: () => Promise<boolean>;
  setMasterKeyFromPassword: (password: string, storeInKeytar?: boolean) => Promise<SetMasterKeyResult>;
  checkKeytarStatus: () => Promise<'available' | 'unavailable' | 'error'>;
  generateAndStoreMasterKey: () => Promise<boolean>;
  clearMasterKey: () => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // SSH Service
  onSshData: (callback) => {
    const handler = (_event: IpcRendererEvent, args: SshDataIPCArgs) => callback(args.data);
    ipcRenderer.on('ssh:data', handler);
    return () => ipcRenderer.removeListener('ssh:data', handler);
  },
  onSshStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, status: SshStatusArgs) => callback(status);
    ipcRenderer.on('ssh:status', handler);
    return () => ipcRenderer.removeListener('ssh:status', handler);
  },
  sshConnect: (args: SshConnectionArgs) => ipcRenderer.send('ssh:connect', args),
  sshDisconnect: () => ipcRenderer.send('ssh:disconnect'),
  sshSendData: (data: string) => ipcRenderer.send('ssh:data-input', { data }),
  sshResize: (args: SshResizeArgs) => ipcRenderer.send('ssh:resize', args),
  pingSsh: () => ipcRenderer.send('ping'), // Assuming 'ping' was the channel for SSH ping

  // Session Management
  loadSessions: () => ipcRenderer.invoke('sessions:load'),
  getSessionById: (id: string) => ipcRenderer.invoke('session:get-by-id', { id }),
  addSession: (profileData: SessionProfileCreateData) => ipcRenderer.invoke('session:add', { profileData }),
  updateSession: (id: string, updates: SessionProfileUpdateData) => ipcRenderer.invoke('session:update', { id, updates }),
  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', { id }),

  // SecureStorage / Master Key
  isMasterKeySet: () => ipcRenderer.invoke('masterkey:is-set'),
  setMasterKeyFromPassword: (password: string, storeInKeytar: boolean = true) => ipcRenderer.invoke('masterkey:set-from-password', { password, storeInKeytar }),
  checkKeytarStatus: () => ipcRenderer.invoke('masterkey:check-keytar'),
  generateAndStoreMasterKey: () => ipcRenderer.invoke('masterkey:generate-and-store'),
  clearMasterKey: () => ipcRenderer.send('masterkey:clear'),
});

console.log('Preload script with extended ElectronAPI (SSH, Session Management, Master Key) loaded.');

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
