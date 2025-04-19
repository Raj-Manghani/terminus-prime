import { app, BrowserWindow, ipcMain, dialog } from 'electron'; // Add dialog
import path from 'path';
import { Client } from 'ssh2';
import { secureStorageService } from './services/SecureStorageService'; // Import storage service
import { sessionManagerService } from './services/SessionManagerService'; // Import session service
import { SessionProfile } from './components/SessionManager'; // Import type

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) {
  app.quit();
}

// No hardcoded password needed now

let mainWindow: BrowserWindow | null;
// let sshClient: Client | null = null; // Remove single client
// let sshStream: any = null; // Remove single stream
let isUnlocked = false; // Track if the app/storage is unlocked

// --- Manage Multiple Connections ---
interface ActiveConnection {
  client: Client;
  stream: any; // ssh2 stream type is complex, 'any' for simplicity here
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
}
const activeConnections = new Map<string, ActiveConnection>();

// Helper to clean up a connection
const cleanupConnection = (tabId: string) => {
    const conn = activeConnections.get(tabId);
    if (conn) {
        console.log(`Cleaning up connection for tab ${tabId}`);
        conn.stream?.end(); // End the stream first
        conn.client?.end(); // Then end the client
        activeConnections.delete(tabId);
        console.log(`Connection removed for tab ${tabId}. Remaining: ${activeConnections.size}`);
    }
};
// --- End Multiple Connections ---


const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    // Optionally hide the window until unlocked
    // show: false,
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();

  // Optionally show window only after unlock signal from main process
  // ipcMain.on('app:unlocked', () => {
  //   mainWindow?.show();
  // });

  mainWindow.on('closed', () => {
    // Clean up all active connections on main window close
    console.log("Main window closed. Cleaning up all active connections...");
    activeConnections.forEach((_, tabId) => {
        cleanupConnection(tabId);
    });
    mainWindow = null;
    isUnlocked = false; // Reset lock state on close
  });
};

// App Initialization - Defer service init until unlock
app.on('ready', () => {
  console.log('App ready. Creating window...');
  // Create the window immediately, it will show the password prompt.
  // Key initialization and session loading happen *after* unlock.
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 || mainWindow === null) {
    createWindow();
  }
});

// --- IPC Handlers ---

// App Unlock Handler
ipcMain.handle('app:unlock', async (event, password) => {
  console.log('IPC: app:unlock received');
  if (isUnlocked) {
      console.log("App already unlocked.");
      return true; // Already unlocked
  }
  if (!password) {
      console.error("Unlock attempt without password.");
      return false; // No password provided
  }

  const keyInitialized = await secureStorageService.initializeEncryptionKey(password);

  if (!keyInitialized) {
    console.error("Key initialization failed (likely incorrect password or storage error).");
    return false; // Signal failure to renderer
  }

  // Load sessions now that the key is ready
  await sessionManagerService.loadSessions();
  isUnlocked = true;
  console.log("App unlocked successfully (key initialized).");
  return true; // Signal success to renderer
});


// SSH Connection Handling (Refactored for Multiple Connections)
ipcMain.on('terminal-connect', (event, { tabId, config }: { tabId: string, config: SessionProfile }) => {
  if (!isUnlocked) {
    console.error(`[${tabId}] Attempted to connect while app is locked.`);
    mainWindow?.webContents.send('terminal-status', { tabId, status: 'error', message: 'Application is locked.' });
    return;
  }
  console.log(`[${tabId}] Received terminal-connect request:`, config);
  if (!tabId || !config || !config.host || !config.username || !config.password) {
    console.error(`[${tabId}] Invalid connection config received:`, { tabId, config });
    mainWindow?.webContents.send('terminal-status', { tabId, status: 'error', message: 'Invalid connection details or missing tabId.' });
    return;
  }

  // Clean up any existing connection for this tabId first
  if (activeConnections.has(tabId)) {
    console.log(`[${tabId}] Cleaning up existing connection before reconnecting.`);
    cleanupConnection(tabId);
  }

  const client = new Client();
  const connection: ActiveConnection = {
    client: client,
    stream: null,
    status: 'connecting',
  };
  activeConnections.set(tabId, connection);
  console.log(`[${tabId}] Connection entry created. Total connections: ${activeConnections.size}`);

  client.on('ready', () => {
    console.log(`[${tabId}] SSH Client :: ready`);
    connection.status = 'connected'; // Update status
    mainWindow?.webContents.send('terminal-status', { tabId, status: 'connected', message: 'SSH connection established.' });

    console.log(`[${tabId}] SSH Client :: Requesting shell...`);
    client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => { // Use local client instance
      console.log(`[${tabId}] SSH Client :: Shell callback received.`);
      if (err) {
        console.error(`[${tabId}] SSH Shell Error:`, err);
        mainWindow?.webContents.send('terminal-status', { tabId, status: 'error', message: `Shell error: ${err.message}` });
        cleanupConnection(tabId); // Clean up on shell error
        return;
      }
      connection.stream = stream; // Store the stream
      console.log(`[${tabId}] SSH Stream :: ready`);

      stream.on('data', (data: Buffer) => {
        const dataString = data.toString('utf-8');
        console.log(`[${tabId}] SSH Stream :: data received, attempting to send to renderer. Length: ${data.length}`); // Log before send
        // console.log(`[${tabId}] Data content: ${JSON.stringify(dataString)}`); // Optional: Log content
        mainWindow?.webContents.send('terminal-incoming-data', { tabId, data: dataString });
      }).stderr.on('data', (data: Buffer) => {
        const dataString = data.toString('utf-8');
        console.error(`[${tabId}] SSH STDERR:`, dataString);
        console.log(`[${tabId}] SSH Stream :: stderr received, attempting to send to renderer. Length: ${data.length}`); // Log before send
        mainWindow?.webContents.send('terminal-incoming-data', { tabId, data: `\x1b[31m${dataString}\x1b[0m` });
      });

      stream.on('close', () => {
        console.log(`[${tabId}] SSH Stream :: close`);
        mainWindow?.webContents.send('terminal-status', { tabId, status: 'disconnected', message: 'Shell closed.' });
        cleanupConnection(tabId); // Clean up when stream closes
      });
      console.log(`[${tabId}] SSH Stream :: data, stderr, close listeners set up.`);
    });
  }).on('error', (err: Error & { level?: string }) => { // Add type for level property
    console.error(`[${tabId}] SSH Client Error:`, err);
    // Avoid sending duplicate 'disconnected' if it's a connection close error
    if (connection.status !== 'disconnected') {
        mainWindow?.webContents.send('terminal-status', { tabId, status: 'error', message: `Connection error: ${err.message}` });
    }
    cleanupConnection(tabId); // Clean up on client error
  }).on('close', () => {
    console.log(`[${tabId}] SSH Client :: close`);
    // Check if cleanup already happened (e.g., via stream close or error)
    if (activeConnections.has(tabId)) {
        mainWindow?.webContents.send('terminal-status', { tabId, status: 'disconnected', message: 'Connection closed.' });
        cleanupConnection(tabId); // Ensure cleanup on client close
    }
  }).connect({
    host: config.host, port: config.port || 22, username: config.username,
    password: config.password, readyTimeout: 20000
  });
});

ipcMain.on('terminal-data', (event, { tabId, data }: { tabId: string, data: string }) => {
  if (!isUnlocked) return; // Ignore if locked
  console.log(`[${tabId}] Received terminal-data event with data: ${JSON.stringify(data)}`); // Log received data
  const conn = activeConnections.get(tabId);
  if (conn && conn.stream && conn.stream.writable) {
    console.log(`[${tabId}] Writing data to stream.`);
    conn.stream.write(data);
  } else {
    console.warn(`[${tabId}] Cannot write data: No active/writable stream found. Connection:`, conn); // Log connection state
  }
});

ipcMain.on('terminal-resize', (event, { tabId, size }: { tabId: string, size: { cols: number, rows: number } }) => {
  if (!isUnlocked) return; // Ignore if locked
  const conn = activeConnections.get(tabId);
  if (conn && conn.stream && size && size.cols && size.rows) {
    console.log(`[${tabId}] Resizing PTY to ${size.cols}x${size.rows}`);
    conn.stream.setWindow(size.rows, size.cols, 0, 0); // Use the stream from the specific connection
  } else {
    console.warn(`[${tabId}] Cannot resize PTY: No active stream found or invalid size.`);
  }
});

// Add handler for explicit disconnection
ipcMain.on('terminal-disconnect', (event, tabId: string) => {
    if (!isUnlocked) return; // Ignore if locked
    console.log(`[${tabId}] Received terminal-disconnect request.`);
    cleanupConnection(tabId);
});

// Session Management IPC Handlers
ipcMain.handle('sessions:get', async () => {
  if (!isUnlocked) {
      console.error("Attempted to get sessions while locked.");
      return []; // Return empty if locked
  }
  console.log('IPC: sessions:get received');
  return sessionManagerService.getSessions();
});

ipcMain.handle('sessions:add', async (event, sessionData) => {
  if (!isUnlocked) {
      console.error("Attempted to add session while locked.");
      throw new Error("Application is locked.");
  }
  console.log('IPC: sessions:add received', sessionData);
  return sessionManagerService.addSession(sessionData);
});

ipcMain.handle('sessions:update', async (event, sessionData) => {
   if (!isUnlocked) {
      console.error("Attempted to update session while locked.");
      throw new Error("Application is locked.");
  }
  console.log('IPC: sessions:update received', sessionData);
  return sessionManagerService.updateSession(sessionData);
});

ipcMain.handle('sessions:delete', async (event, sessionId) => {
   if (!isUnlocked) {
      console.error("Attempted to delete session while locked.");
      throw new Error("Application is locked.");
  }
  console.log('IPC: sessions:delete received', sessionId);
  return sessionManagerService.deleteSession(sessionId);
});

// Settings IPC Handlers (Example)
ipcMain.handle('settings:get', async () => {
    if (!isUnlocked) return {}; // Return empty settings if locked
    return secureStorageService.getSettings();
});

ipcMain.handle('settings:set', async (event, settings) => {
    if (!isUnlocked) throw new Error("Application is locked.");
    secureStorageService.setSettings(settings);
});
