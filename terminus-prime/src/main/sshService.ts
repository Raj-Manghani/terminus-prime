import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { BrowserWindow, app } from 'electron'; // Added app import for will-quit example if moved here

interface SshConnectionDetails {
  host: string;
  port: number;
  username: string;
  password?: string;
  // privateKey?: string; // For key-based auth (actual key content)
  // passphrase?: string;
}

// Store active connections, mapping window ID to Client
const activeConnections = new Map<number, Client>();
const activeShells = new Map<number, ClientChannel>();

export const SshService = {
  connect: (win: BrowserWindow, details: SshConnectionDetails): Promise<void> => {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const windowId = win.id; // Store for use in event handlers that might outlive 'win' reference directly
      activeConnections.set(windowId, conn);

      conn.on('ready', () => {
        console.log(`[Window ${windowId}] SSH client ready`);
        win.webContents.send('ssh:status', { windowId, status: 'connected', message: 'SSH connection established.' });

        conn.shell((err, stream) => {
          if (err) {
            console.error(`[Window ${windowId}] SSH shell error:`, err);
            win.webContents.send('ssh:error', { windowId, message: 'SSH shell failed: ' + err.message });
            conn.end(); // Should trigger 'end' and 'close' on client which handles cleanup
            return reject(err);
          }
          activeShells.set(windowId, stream);
          console.log(`[Window ${windowId}] SSH shell opened.`);

          stream.on('close', () => {
            console.log(`[Window ${windowId}] SSH stream closed`);
            // The 'end' event on the client should handle the final cleanup.
            // Sending redundant status may or may not be desired.
            // win.webContents.send('ssh:status', { windowId, status: 'disconnected', message: 'SSH connection closed.' });
            // conn.end(); // This is important to ensure client connection is also closed
            // activeConnections.delete(windowId); // Handled by client 'end'
            // activeShells.delete(windowId); // Handled by client 'end' or here if client doesn't end
            if (activeShells.has(windowId)) { // Clean up shell if client 'end' hasn't run yet or stream closed independently
                activeShells.delete(windowId);
            }
            if(activeConnections.has(windowId) && !conn.writable) { // if client still in map and not writable (implies ended/closed)
                 // conn.end(); // Already called or will be called
            }
          }).on('data', (data: Buffer) => {
            win.webContents.send('ssh:data', { windowId, data: data.toString() });
          }).stderr.on('data', (data: Buffer) => {
            win.webContents.send('ssh:data', { windowId, data: data.toString() }); // Sending stderr as data too
          });

          resolve();
        });
      }).on('error', (err) => {
        console.error(`[Window ${windowId}] SSH connection error:`, err);
        win.webContents.send('ssh:status', { windowId, status: 'error', message: 'SSH connection error: ' + err.message });
        // Client 'end' should be emitted, which handles cleanup. If not, cleanup here.
        if (activeConnections.has(windowId)) {
            activeConnections.delete(windowId);
        }
        if (activeShells.has(windowId)) {
            activeShells.delete(windowId);
        }
        reject(err);
      }).on('end', () => { // Client connection ended (either by us or server)
        console.log(`[Window ${windowId}] SSH client connection ended.`);
        if (activeShells.has(windowId)) { // If shell was open, ensure it's cleaned up
             const stream = activeShells.get(windowId);
             // stream?.end(); // Shell stream should be closed by now or will be.
             activeShells.delete(windowId);
        }
        if (activeConnections.has(windowId)) {
            win.webContents.send('ssh:status', { windowId, status: 'disconnected', message: 'SSH connection ended.' });
            activeConnections.delete(windowId);
        }
      }).connect({
        host: details.host,
        port: details.port,
        username: details.username,
        password: details.password,
        // privateKey: details.privateKey ? require('fs').readFileSync(details.privateKey) : undefined,
        // passphrase: details.passphrase,
        readyTimeout: 20000,
        algorithms: { // Added for better compatibility with modern servers
            serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
            kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'],
            cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'chacha20-poly1305@openssh.com'],
            hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
        }
      } as ConnectConfig); // Type assertion for algorithms
    });
  },

  sendData: (winId: number, data: string): void => {
    const stream = activeShells.get(winId);
    if (stream && stream.writable) {
      stream.write(data);
    } else {
      console.warn(`[Window ${winId}] No active or writable SSH shell for data send.`);
    }
  },

  disconnect: (winId: number): void => {
    const conn = activeConnections.get(winId);
    if (conn) {
      console.log(`[Window ${winId}] Disconnecting SSH explicitly.`);
      conn.end(); // This will trigger 'close' on stream and 'end' on client
    } else {
      console.warn(`[Window ${winId}] No active SSH connection to disconnect.`);
    }
  },

  disconnectAll: (): void => {
    console.log('Disconnecting all SSH connections...');
    activeConnections.forEach((conn, winId) => {
        console.log(`[Window ${winId}] Disconnecting during app quit.`);
        conn.end();
    });
    activeConnections.clear();
    activeShells.clear();
  },

  resizePty: (winId: number, cols: number, rows: number, height: number, width: number): void => {
    const stream = activeShells.get(winId);
    if (stream && typeof (stream as any).setWindow === 'function') {
      (stream as any).setWindow(rows, cols, height, width);
      // console.log(`[Window ${winId}] Resized PTY to ${cols}x${rows}`);
    } else {
      // console.warn(`[Window ${winId}] No active shell or shell does not support PTY resize.`);
    }
  }
};
