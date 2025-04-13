import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { Client } from 'ssh2'; // Uncomment SSH import

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
// No preload script needed with nodeIntegration: true

// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null;
let sshClient: Client | null = null;
let sshStream: any = null; // Using 'any' for now to avoid type issues

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      // No preload script needed with nodeIntegration: true
      nodeIntegration: true, // Enable Node.js integration in the renderer
      contextIsolation: false, // Disable context isolation (less secure, but often needed with nodeIntegration: true)
    },
  });

  // Load the URL provided by the Webpack plugin (dev server)
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    // Close SSH connection if it exists
    if (sshStream) {
      sshStream.end();
    }
    if (sshClient) {
      sshClient.end();
    }
    sshClient = null;
    sshStream = null;
    mainWindow = null;
  });
};

app.on('ready', createWindow);

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

ipcMain.on('terminal-connect', (event, config) => {
  console.log('Received terminal-connect request:', config);
  if (sshClient) {
    console.log('SSH client already exists, ending previous connection.');
    sshStream?.end();
    sshClient.end();
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
        sshClient?.end();
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
     if (sshStream) {
        mainWindow?.webContents.send('terminal-status', { status: 'disconnected', message: 'Connection closed.' });
        sshStream = null;
     }
    sshClient = null;
  }).connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password,
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
    sshStream.setWindow(size.rows, size.cols, 0, 0); // Height/width in pixels usually not needed
  }
});
