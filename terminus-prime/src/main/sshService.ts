import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { BrowserWindow } from 'electron';

export interface SshConnectionDetails {
  host: string; port: number; username: string; password?: string;
  privateKey?: string; passphrase?: string;
}
const activeConnections = new Map<string, Client>();
const activeShells = new Map<string, ClientChannel>();

export const SshService = {
  connect: (terminalInstanceId: string, win: BrowserWindow, details: SshConnectionDetails): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (activeConnections.has(terminalInstanceId)) {
        console.log(`[TermInst ${terminalInstanceId}] Closing existing connection.`);
        activeConnections.get(terminalInstanceId)?.end();
      }
      const conn = new Client();
      const windowId = win.id;
      activeConnections.set(terminalInstanceId, conn);
      conn.on('ready', () => {
        console.log(`[TermInst ${terminalInstanceId}] SSH client ready.`);
        win.webContents.send('ssh:status', { terminalInstanceId, windowId, status: 'connected', message: 'Connection established.' });
        conn.shell((err, stream) => {
          if (err) {
            console.error(`[TermInst ${terminalInstanceId}] SSH shell error:`, err);
            win.webContents.send('ssh:status', { terminalInstanceId, windowId, status: 'error', message: 'Shell failed: ' + err.message });
            conn.end(); return reject(err);
          }
          activeShells.set(terminalInstanceId, stream);
          console.log(`[TermInst ${terminalInstanceId}] SSH shell opened.`);
          stream.on('close', () => {
            console.log(`[TermInst ${terminalInstanceId}] SSH stream closed.`);
            if (activeConnections.has(terminalInstanceId)) conn.end();
            else if (activeShells.has(terminalInstanceId)) activeShells.delete(terminalInstanceId);
          }).on('data', (data: Buffer) => {
            win.webContents.send('ssh:data', { terminalInstanceId, windowId, data: data.toString() });
          }).stderr.on('data', (data: Buffer) => {
            win.webContents.send('ssh:data', { terminalInstanceId, windowId, data: data.toString() });
          });
          resolve();
        });
      }).on('error', (err) => {
        console.error(`[TermInst ${terminalInstanceId}] SSH connection error:`, err);
        win.webContents.send('ssh:status', { terminalInstanceId, windowId, status: 'error', message: 'Connection error: ' + err.message });
        if (activeShells.has(terminalInstanceId)) activeShells.delete(terminalInstanceId);
        if (activeConnections.has(terminalInstanceId)) activeConnections.delete(terminalInstanceId);
        reject(err);
      }).on('end', () => {
        console.log(`[TermInst ${terminalInstanceId}] SSH client connection ended.`);
        if (activeShells.has(terminalInstanceId)) activeShells.delete(terminalInstanceId);
        if (activeConnections.has(terminalInstanceId)) {
          win.webContents.send('ssh:status', { terminalInstanceId, windowId, status: 'disconnected', message: 'Connection ended.' });
          activeConnections.delete(terminalInstanceId);
        }
      }).connect({
        host: details.host, port: details.port, username: details.username, password: details.password,
        privateKey: details.privateKey ? Buffer.from(details.privateKey) : undefined,
        passphrase: details.passphrase, readyTimeout: 20000,
        algorithms: { serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'], kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'], cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'chacha20-poly1305@openssh.com'], hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']}
      } as ConnectConfig);
    });
  },
  sendData: (terminalInstanceId: string, data: string): void => {
    const stream = activeShells.get(terminalInstanceId);
    if (stream?.writable) stream.write(data); else console.warn(`[TermInst ${terminalInstanceId}] No active/writable shell.`);
  },
  disconnect: (terminalInstanceId: string): void => {
    const conn = activeConnections.get(terminalInstanceId);
    if (conn) { console.log(`[TermInst ${terminalInstanceId}] Disconnecting SSH.`); conn.end(); }
    else console.warn(`[TermInst ${terminalInstanceId}] No active connection to disconnect.`);
  },
  disconnectAll: (): void => { activeConnections.forEach((conn, id) => { console.log(`[TermInst ${id}] Disconnecting on app quit.`); conn.end(); });},
  resizePty: (terminalInstanceId: string, cols: number, rows: number, height: number, width: number): void => {
    const stream = activeShells.get(terminalInstanceId);
    if (stream && typeof (stream as any).setWindow === 'function') (stream as any).setWindow(rows, cols, height, width);
    else console.warn(`[TermInst ${terminalInstanceId}] No shell or cannot resize PTY.`);
  }
};
