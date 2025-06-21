import { SecureStorageService } from './main/secureStorageService';
import { SessionManagerService } from './main/sessionManagerService';
import { SshService } from './main/sshService';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';

// Append command line switches before app is ready
// These are for running in headless/virtualized environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox'); // Often used with disable-gpu in CI
// Potentially also: app.commandLine.appendSwitch('in-process-gpu');
// Potentially also: app.commandLine.appendSwitch('disable-dev-shm-usage');

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
      sandbox: false, // Setting sandbox:false here. The no-sandbox flag is more global.
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
  // --- Session Management IPC Handlers ---
  ipcMain.handle("sessions:load", async () => {
    try { return await SessionManagerService.getAllSessions(); }
    catch (e) { console.error("IPC sessions:load error:", e); return []; }
  });

  ipcMain.handle("session:get-by-id", async (_event, { id }) => {
    try { return await SessionManagerService.getSessionById(id); }
    catch (e) { console.error(`IPC session:get-by-id error for id ${id}:`, e); return undefined; }
  });

  ipcMain.handle("session:add", async (_event, { profileData }) => {
    try { return await SessionManagerService.addSession(profileData); }
    catch (e) { console.error("IPC session:add error:", e); return null; }
  });

  ipcMain.handle("session:update", async (_event, { id, updates }) => {
    try { return await SessionManagerService.updateSession(id, updates); }
    catch (e) { console.error(`IPC session:update error for id ${id}:`, e); return null; }
  });

  ipcMain.handle("session:delete", async (_event, { id }) => {
    try { return await SessionManagerService.deleteSession(id); }
    catch (e) { console.error(`IPC session:delete error for id ${id}:`, e); return false; }
  });

  // --- SecureStorageService / Master Key IPC Handlers ---
  ipcMain.handle("masterkey:is-set", async () => {
    try { return SecureStorageService.isMasterKeyAvailable(); }
    catch (e) { console.error("IPC masterkey:is-set error:", e); return false; }
  });

  ipcMain.handle("masterkey:set-from-password", async (_event, { password, storeInKeytar }) => {
    try { return await SecureStorageService.setMasterKeyWithPassword(password, storeInKeytar); }
    catch (e) { console.error("IPC masterkey:set-from-password error:", e); return {success: false}; }
  });

  ipcMain.handle("masterkey:check-keytar", async () => {
    try { return await SecureStorageService.checkKeytarStatus(); }
    catch (e) { console.error("IPC masterkey:check-keytar error:", e); return 'error'; }
  });

  ipcMain.handle("masterkey:generate-and-store", async () => {
    try { return await SecureStorageService.generateAndStoreMasterKey(); }
    catch (e) { console.error("IPC masterkey:generate-and-store error:", e); return false; }
  });

  ipcMain.on("masterkey:clear", () => { // Use .on for void returns
    try { SecureStorageService.clearInMemoryMasterKey(); SessionManagerService.invalidateCache(); }
    catch (e) { console.error("IPC masterkey:clear error:", e); }
  });

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
