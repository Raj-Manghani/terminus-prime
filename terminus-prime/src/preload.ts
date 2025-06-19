import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface SshConnectionArgs {
  host: string;
  port: number;
  username: string;
  password?: string;
}

export interface SshStatus {
  windowId: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
}

export interface SshDataArgs {
  data: string;
}

export interface SshResizeArgs {
  cols: number;
  rows: number;
  height: number;
  width: number;
}

export interface ElectronAPI {
  onSshData: (callback: (data: string) => void) => (() => void);
  onSshStatus: (callback: (status: SshStatus) => void) => (() => void);
  sshConnect: (args: SshConnectionArgs) => void;
  sshDisconnect: () => void;
  sshSendData: (data: string) => void;
  sshResize: (args: SshResizeArgs) => void;
  ping: () => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  onSshData: (callback) => {
    const handler = (_event: IpcRendererEvent, args: SshDataArgs) => callback(args.data);
    ipcRenderer.on('ssh:data', handler);
    return () => ipcRenderer.removeListener('ssh:data', handler);
  },
  onSshStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, status: SshStatus) => callback(status);
    ipcRenderer.on('ssh:status', handler);
    return () => ipcRenderer.removeListener('ssh:status', handler);
  },
  sshConnect: (args: SshConnectionArgs) => ipcRenderer.send('ssh:connect', args),
  sshDisconnect: () => ipcRenderer.send('ssh:disconnect'),
  sshSendData: (data: string) => ipcRenderer.send('ssh:data-input', { data }),
  sshResize: (args: SshResizeArgs) => ipcRenderer.send('ssh:resize', args),
  ping: () => ipcRenderer.send('ping')
});

console.log('Preload script with detailed electronAPI for SSH loaded.');

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
