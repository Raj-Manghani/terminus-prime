import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import path from 'node:path';
// import { electronApp, optimizer, is } from '@electron-toolkit/utils'; // If using electron-toolkit

import { SshService } from './main/sshService';
import { SessionManagerService } from './main/sessionManagerService';
import { SecureStorageService } from './main/secureStorageService';
import type { TabDataFromRenderer } from '../preload';

declare const MAIN_WINDOW_VITE_NAME: string;
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

const pendingDetachedTabs = new Map<number, TabDataFromRenderer>();
let mainWindow: BrowserWindow | null = null;
const allWindows = new Set<BrowserWindow>();

function createWindow(initialDetachedData?: TabDataFromRenderer): BrowserWindow {
  const newWindow = new BrowserWindow({
    width: 1200, height: 800, show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Correct for Electron Forge Vite
      sandbox: false, contextIsolation: true, nodeIntegration: false,
    },
  });
  allWindows.add(newWindow);

  let loadUrl: string;
  const queryParams: Record<string, string> = {};
  if (initialDetachedData) {
    pendingDetachedTabs.set(newWindow.id, initialDetachedData);
    queryParams.isDetached = 'true';
  }

  const rendererUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL; // From declare

  if (rendererUrl) { // is.dev equivalent for Vite HMR
    loadUrl = rendererUrl;
    if (Object.keys(queryParams).length > 0) {
        const devUrl = new URL(loadUrl);
        for(const key in queryParams) devUrl.searchParams.append(key, queryParams[key]);
        loadUrl = devUrl.toString();
    }
    if(!initialDetachedData && process.env.NODE_ENV === 'development') newWindow.webContents.openDevTools();
  } else {
    const filePath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    const tempUrl = new URL('file://' + filePath); // Ensure file protocol
    for(const key in queryParams) tempUrl.searchParams.append(key, queryParams[key]);
    loadUrl = tempUrl.toString();
  }
  newWindow.loadURL(loadUrl);

  newWindow.on('ready-to-show', () => newWindow.show());
  newWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' }; });
  newWindow.on('closed', () => {
    pendingDetachedTabs.delete(newWindow.id);
    allWindows.delete(newWindow);
    if (newWindow === mainWindow) mainWindow = null;
  });
  return newWindow;
}

app.whenReady().then(() => {
  // electronApp?.setAppUserModelId('com.terminusprime');
  // app.on('browser-window-created', (_, window) => { optimizer?.watchWindowShortcuts(window); });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://localhost:*; object-src 'none';"] }});
  });

  // SSH IPC (terminalInstanceId aware)
  ipcMain.on("ssh:connect", async (event, args) => { const w = BrowserWindow.fromWebContents(event.sender); if (w && args.terminalInstanceId && args.details) { try { await SshService.connect(args.terminalInstanceId, w, args.details); } catch (e:any) { event.sender.send("ssh:status", { terminalInstanceId: args.terminalInstanceId, windowId: w.id, status: "error", message: e.message || "Err" }); } } else { console.error("IPC ssh:connect: Invalid args", args); }});
  ipcMain.on("ssh:disconnect", (_e, args) => { if(args.terminalInstanceId) SshService.disconnect(args.terminalInstanceId); });
  ipcMain.on("ssh:data-input", (_e, args) => { if(args.terminalInstanceId && typeof args.data === 'string') SshService.sendData(args.terminalInstanceId, args.data); });
  ipcMain.on("ssh:resize", (_e, args) => { if(args.terminalInstanceId && args.cols !== undefined) SshService.resizePty(args.terminalInstanceId, args.cols, args.rows, args.height, args.width); });
  ipcMain.on('ping', () => console.log('pong from main process'));

  // Session Management IPC
  ipcMain.handle("sessions:load", async () => SessionManagerService.getAllSessions());
  ipcMain.handle("session:get-by-id", async (_e, {id}) => SessionManagerService.getSessionById(id));
  ipcMain.handle("session:add", async (_e, {profileData}) => SessionManagerService.addSession(profileData));
  ipcMain.handle("session:update", async (_e, {id, updates}) => SessionManagerService.updateSession(id, updates));
  ipcMain.handle("session:delete", async (_e, {id}) => SessionManagerService.deleteSession(id));

  // SecureStorage / Master Key IPC
  ipcMain.handle("masterkey:is-set", async () => SecureStorageService.isMasterKeyAvailable());
  ipcMain.handle("masterkey:set-from-password", async (_e, {password, storeInKeytar}) => SecureStorageService.setMasterKeyWithPassword(password, storeInKeytar));
  ipcMain.handle("masterkey:check-keytar", async () => SecureStorageService.checkKeytarStatus());
  ipcMain.handle("masterkey:generate-and-store", async () => SecureStorageService.generateAndStoreMasterKey());
  ipcMain.on("masterkey:clear", () => { SecureStorageService.clearInMemoryMasterKey(); SessionManagerService.invalidateCache(); });

  // Detachable Tab IPC
  ipcMain.on('window:request-detach-tab', (_event, tabDataSnapshot: TabDataFromRenderer) => {
    console.log('Main: Request to detach tab:', tabDataSnapshot.title);
    createWindow(tabDataSnapshot);
  });
  ipcMain.on('window:detached-renderer-ready', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      const tabData = pendingDetachedTabs.get(window.id);
      if (tabData) {
        console.log(`Main: Detached renderer for window ${window.id} is ready. Sending data for tab ${tabData.title}.`);
        window.webContents.send('window:here-is-your-detached-data', tabData);
      } else console.warn(`Main: Detached renderer for window ${window.id} ready, but no pending data.`);
    }
  });

  mainWindow = createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); else mainWindow?.focus(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { SshService.disconnectAll(); });
