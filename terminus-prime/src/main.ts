import { SshService } from './main/sshService';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';

// Note: @electron-toolkit/utils (is, electronApp, optimizer) are not installed by default
// by the electron-forge vite template. If these utilities are desired,
// install with: npm install @electron-toolkit/utils
// For now, their usage is commented out or replaced with standard Electron logic.

// This global variable is set by the electron-forge Vite plugin.
// It's used to differentiate between development and production.
// It will be replaced with 'index' or other name during build.
declare const MAIN_WINDOW_VITE_NAME: string;
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;


function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Path from original Forge template
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load URL for development or local HTML for production
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools(); // Open DevTools in development
  } else {
    // This path is based on the structure electron-forge + vite creates in production.
    // MAIN_WINDOW_VITE_NAME will be correctly substituted by the build process.
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(() => {
  // IPC Handlers for SSH Service
  ipcMain.on("ssh:connect", async (event, args) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      try {
        console.log(`IPC ssh:connect request for window ${window.id}:`, args);
        await SshService.connect(window, args);
      } catch (error: any) {
        console.error("Error connecting via IPC ssh:connect:", error);
        event.sender.send("ssh:status", { windowId: window.id, status: "error", message: error.message || "Failed to connect" });
      }
    } else { console.error("ssh:connect event sender window not found"); }
  });

  ipcMain.on("ssh:disconnect", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      console.log(`IPC ssh:disconnect request for window ${window.id}`);
      SshService.disconnect(window.id);
    } else { console.error("ssh:disconnect event sender window not found"); }
  });

  ipcMain.on("ssh:data-input", (event, args) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && args && typeof args.data === "string") {
      SshService.sendData(window.id, args.data);
    } else if (!window) { console.error("ssh:data-input event sender window not found"); }
      else { console.warn("ssh:data-input received invalid args:", args); }
  });

  ipcMain.on("ssh:resize", (event, args) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && args) {
      SshService.resizePty(window.id, args.cols, args.rows, args.height, args.width);
    } else if (!window) { console.error("ssh:resize event sender window not found"); }
  });

  ipcMain.on('ping', () => console.log('pong from main process'));
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => { SshService.disconnectAll(); });
