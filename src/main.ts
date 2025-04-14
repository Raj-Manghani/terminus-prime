import { app, BrowserWindow, ipcMain } from 'electron';
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

// !!! TEMPORARY - Replace with a proper password prompt/handling mechanism !!!
const TEMP_MASTER_PASSWORD = "password";
// !!! --- !!!

let mainWindow: BrowserWindow | null;
let sshClient: Client | null = null;
let sshStream: any = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    if (sshStream) sshStream.end();
    if (sshClient) sshClient.end();
    sshClient = null;
    sshStream = null;
    mainWindow = null;
  });
};

// App Initialization
app.on('ready', async () => {
  console.log('App ready, initializing services...');
  // Initialize encryption key using password derivation
  const keyInitialized = await secureStorageService.initializeEncryptionKey(TEMP_MASTER_PASSWORD);

  if (!keyInitialized) {
    // Handle key initialization failure (e.g., show error dialog)
    console.error("FATAL: Could not initialize encryption key. Exiting.");
    // TODO: Show an error message to the user before quitting
    app.quit();
    return;
  }

  // Load sessions now that the key is ready
  await sessionManagerService.loadSessions();

  // Create the main window
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

// SSH Connection Handling (existing)
ipcMain.on('terminal-connect', (event, config: SessionProfile) => { // Use SessionProfile type
  console.log('Received terminal-connect request:', config);
  if (!config || !config.host || !config.username || !config.password) {
      console.error('Invalid connection config received:', config);
      mainWindow?.webContents.send('terminal-status', { status: 'error', message: 'Invalid connection details.' });
      return;
  }

  if (sshClient) {
    console.log('SSH client already exists, ending previous connection.');
    sshStream?.end();
    sshClient.end(); // End previous client
    sshClient = null;
    sshStream = null;
  }

  sshClient = new Client();
  sshClient.on('ready', () => {
    console.log('SSH Client :: ready');
    mainWindow?.webContents.send('terminal-status', { status: 'connected', message: 'SSH connection established.' });

    sshClient?.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
      if (err) {
        console.error('SSH Shell Error:', err);
        mainWindow?.webContents.send('terminal-status', { status: 'error', message: `Shell error: ${err.message}` });
        sshClient?.end();
        sshClient = null;
        return;
      }
      sshStream = stream;
      console.log('SSH Stream :: ready');

      sshStream.on('data', (data: Buffer) => {
        mainWindow?.webContents.send('terminal-incoming-data', data.toString('utf-8'));
      }).stderr.on('data', (data: Buffer) => {
        console.error('SSH STDERR:', data.toString('utf-8'));
        mainWindow?.webContents.send('terminal-incoming-data', `\x1b[31m${data.toString('utf-8')}\x1b[0m`);
      });

      sshStream.on('close', () => {
        console.log('SSH Stream :: close');
        mainWindow?.webContents.send('terminal-status', { status: 'disconnected', message: 'Shell closed.' });
        sshClient?.end(); // Ensure client is ended when stream closes
        sshClient = null;
        sshStream = null;
      });
    });
  }).on('error', (err) => {
    console.error('SSH Client Error:', err);
    mainWindow?.webContents.send('terminal-status', { status: 'error', message: `Connection error: ${err.message}` });
    sshClient = null;
    sshStream = null;
  }).on('close', () => {
    console.log('SSH Client :: close');
     if (sshStream) { // Check if stream existed before sending status
        mainWindow?.webContents.send('terminal-status', { status: 'disconnected', message: 'Connection closed.' });
        sshStream = null;
     }
    sshClient = null; // Ensure client is nullified on close
  }).connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password, // Password provided at runtime
    readyTimeout: 20000
  });
});

ipcMain.on('terminal-data', (event, data) => {
  if (sshStream && sshStream.writable) {
    sshStream.write(data);
  }
});

ipcMain.on('terminal-resize', (event, size: { cols: number, rows: number }) => {
  if (sshStream && size && size.cols && size.rows) {
    console.log(`Resizing PTY to ${size.cols}x${size.rows}`);
    // Most SSH servers only care about cols and rows for PTY size
    sshStream.setWindow(size.rows, size.cols, 0, 0);
  }
});

// Session Management IPC Handlers
ipcMain.handle('sessions:get', async () => {
  console.log('IPC: sessions:get received');
  // Key should be initialized on app 'ready'. If not, something went wrong.
  // We might add a check here later, but rely on 'ready' handler for now.
  // if (!secureStorageService['keyInitialized']) {
  //     console.error("Attempted to get sessions before key was initialized!");
  //     return []; // Or throw error
  // }
  return sessionManagerService.getSessions();
});

ipcMain.handle('sessions:add', async (event, sessionData) => {
  console.log('IPC: sessions:add received', sessionData);
  return sessionManagerService.addSession(sessionData);
});

ipcMain.handle('sessions:update', async (event, sessionData) => {
  console.log('IPC: sessions:update received', sessionData);
  return sessionManagerService.updateSession(sessionData);
});

ipcMain.handle('sessions:delete', async (event, sessionId) => {
  console.log('IPC: sessions:delete received', sessionId);
  return sessionManagerService.deleteSession(sessionId);
});

// Settings IPC Handlers (Example)
ipcMain.handle('settings:get', async () => {
    return secureStorageService.getSettings();
});

ipcMain.handle('settings:set', async (event, settings) => {
    secureStorageService.setSettings(settings);
});
