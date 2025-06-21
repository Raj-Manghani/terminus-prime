import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Re-define types here for clarity and independence, or use a shared types package
export interface SshConnectionDetails { host: string; port: number; username: string; password?: string; privateKey?: string; passphrase?: string; }
export interface TerminalInstance { id: string; sshConnectionArgs?: SshConnectionDetails; sshStatus: string; title: string; }
export interface PaneData { id: string; type: 'terminal' | 'split'; direction?: 'horizontal' | 'vertical'; children?: PaneData[]; terminalInstanceId?: string; size?: number | string; }
export interface TabDataFromRenderer { id: string; title: string; rootPane: PaneData; activeTerminalInstanceId: string | null; containedTerminalInstances: TerminalInstance[]; }
export interface SessionProfile { id: string; name: string; host: string; port: number; username: string; authMethod: 'password' | 'key' | 'agent'; password?: string; privateKeyPath?: string; notes?: string; createdAt: string; updatedAt: string; }
export type SessionProfileCreateData = Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>;
export type SessionProfileUpdateData = Partial<SessionProfileCreateData>;
export interface SetMasterKeyResult { success: boolean; saltHex?: string; }
export interface SshStatusIPCArgs { terminalInstanceId: string; windowId: number; status: string; message: string; }
export interface SshDataIPCArgs { terminalInstanceId: string; windowId: number; data: string; }

export interface ElectronAPI {
  onSshData: (callback: (event: SshDataIPCArgs) => void) => (() => void);
  onSshStatus: (callback: (event: SshStatusIPCArgs) => void) => (() => void);
  sshConnect: (args: { terminalInstanceId: string; details: SshConnectionDetails }) => void;
  sshDisconnect: (args: { terminalInstanceId: string }) => void;
  sshSendData: (args: { terminalInstanceId: string; data: string }) => void;
  sshResize: (args: { terminalInstanceId: string; cols: number; rows: number; height: number; width: number }) => void;
  pingSsh: () => void; // Renamed from 'ping'

  loadSessions: () => Promise<SessionProfile[]>;
  getSessionById: (id: string) => Promise<SessionProfile | undefined>;
  addSession: (profileData: SessionProfileCreateData) => Promise<SessionProfile | null>;
  updateSession: (id: string, updates: SessionProfileUpdateData) => Promise<SessionProfile | null>;
  deleteSession: (id: string) => Promise<boolean>;

  isMasterKeySet: () => Promise<boolean>;
  setMasterKeyFromPassword: (password: string, storeInKeytar?: boolean) => Promise<SetMasterKeyResult>;
  checkKeytarStatus: () => Promise<'available' | 'unavailable' | 'error'>;
  generateAndStoreMasterKey: () => Promise<boolean>;
  clearMasterKey: () => void;

  requestDetachTab: (tabDataSnapshot: TabDataFromRenderer) => void;
  onWindowReadyForDetachedData: (callback: (tabData: TabDataFromRenderer) => void) => (() => void);
}

contextBridge.exposeInMainWorld('electronAPI', {
  onSshData: (cb) => { const h = (_e: IpcRendererEvent, a: SshDataIPCArgs) => cb(a); ipcRenderer.on('ssh:data', h); return () => ipcRenderer.removeListener('ssh:data', h); },
  onSshStatus: (cb) => { const h = (_e: IpcRendererEvent, s: SshStatusIPCArgs) => cb(s); ipcRenderer.on('ssh:status', h); return () => ipcRenderer.removeListener('ssh:status', h); },
  sshConnect: (a) => ipcRenderer.send('ssh:connect', a),
  sshDisconnect: (a) => ipcRenderer.send('ssh:disconnect', a),
  sshSendData: (a) => ipcRenderer.send('ssh:data-input', a),
  sshResize: (a) => ipcRenderer.send('ssh:resize', a),
  pingSsh: () => ipcRenderer.send('ping'), // Ensure main handles 'ping'

  loadSessions: () => ipcRenderer.invoke('sessions:load'),
  getSessionById: (id) => ipcRenderer.invoke('session:get-by-id', { id }),
  addSession: (pD) => ipcRenderer.invoke('session:add', { profileData: pD }),
  updateSession: (id, u) => ipcRenderer.invoke('session:update', { id, updates: u }),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', { id }),
  isMasterKeySet: () => ipcRenderer.invoke('masterkey:is-set'),
  setMasterKeyFromPassword: (p, sIK) => ipcRenderer.invoke('masterkey:set-from-password', { password: p, storeInKeytar: sIK }),
  checkKeytarStatus: () => ipcRenderer.invoke('masterkey:check-keytar'),
  generateAndStoreMasterKey: () => ipcRenderer.invoke('masterkey:generate-and-store'),
  clearMasterKey: () => ipcRenderer.send('masterkey:clear'),

  requestDetachTab: (tds) => ipcRenderer.send('window:request-detach-tab', tds),
  onWindowReadyForDetachedData: (callback) => {
    const handler = (_event: IpcRendererEvent, tabData: TabDataFromRenderer) => callback(tabData);
    ipcRenderer.on('window:here-is-your-detached-data', handler);
    ipcRenderer.send('window:detached-renderer-ready');
    return () => ipcRenderer.removeListener('window:here-is-your-detached-data', handler);
  },
});
declare global { interface Window { electronAPI: ElectronAPI; } }
console.log('Preload script (v5 - detachable tabs API) loaded.');
