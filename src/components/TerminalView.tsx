import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css'; // Import xterm CSS

// Use require directly now that nodeIntegration is enabled (or handle contextBridge if preferred)
// Based on your preload.ts, you might prefer:
// const { ipcRenderer } = window.electronAPI;
// but keeping require for now as it was in your original code.
const { ipcRenderer } = require('electron');


// Assuming SessionProfile is defined elsewhere or you have a placeholder type
interface SessionProfile {
    host: string;
    port?: number;
    username: string;
    password?: string; // Or key path/passphrase
    // Add other session properties as needed
}


interface TerminalViewProps {
  tabId: string; // Add tabId prop
  session: SessionProfile | null;
  isActive: boolean; // Add isActive prop
  // isConnected and reconnectTrigger props removed as they are state within the component
}

const TerminalView: React.FC<TerminalViewProps> = ({ tabId, session, isActive }) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false); // Use ref for immediate state check in event handlers
  const [isConnecting, setIsConnecting] = useState(false);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef(new FitAddon());
  const searchAddonInstance = useRef(new SearchAddon());
  const webglAddonInstance = useRef<WebglAddon | null>(null);
  const lastSessionKeyRef = useRef<string>(''); // To track if session config has changed

  // Define IPC handlers outside of effects to ensure stable references
  // These handlers are attached/removed in Effect 1
  const handleIncomingData = (event: any, payload: { tabId: string, data: string }) => {
      // console.log(`[${payload.tabId}] handleIncomingData received. Target tabId: ${tabId}`); // Debug log
      if (payload.tabId === tabId && termInstance.current) {
          // console.log(`[${tabId}] Writing incoming data to terminal. Length: ${payload.data.length}`); // Log before write
          termInstance.current.write(payload.data);
      }
  };

  const handleStatusUpdate = (event: any, payload: { tabId: string, status: string, message: string }) => {
      if (payload.tabId === tabId) {
          console.log(`[${tabId}] IPC: terminal-status: ${payload.status} - ${payload.message}`);
          const connected = payload.status === 'connected';
          setIsConnected(connected);
          isConnectedRef.current = connected; // Update ref immediately
          setIsConnecting(false);
          // Write status message to terminal, clear previous connecting message
          termInstance.current?.clear(); // Clear previous messages
          termInstance.current?.writeln(`\x1b[33m[STATUS: ${payload.status}] ${payload.message}\x1b[0m`);
          // Try writing an empty string to potentially force a refresh after connection - might not be necessary
          // if (connected && termInstance.current) {
          //      console.log(`[${tabId}] Writing empty string after connected status.`);
          //      termInstance.current.write('');
          // }
          // Focus the terminal automatically on successful connection
          if (connected && termInstance.current) {
              console.log(`[${tabId}] Connection successful, focusing terminal.`);
              termInstance.current.focus();
          }
      }
  };


  // --- Effect 1: IPC Listener Setup and Cleanup (Runs once on mount) ---
  // Attaches/removes listeners for data and status updates from Main process
  useEffect(() => {
    console.log(`[${tabId}] TerminalView: IPC Listener Effect Running (Mount)...`);

    // Setup IPC listeners
    ipcRenderer.on('terminal-incoming-data', handleIncomingData);
    ipcRenderer.on('terminal-status', handleStatusUpdate);
    console.log(`[${tabId}] IPC listeners attached.`);

    // Cleanup function for this effect (runs only on component unmount)
    return () => {
        console.log(`[${tabId}] Cleaning up TerminalView IPC Listener Effect (Unmount)...`);
        // Remove IPC listeners
        ipcRenderer.removeListener('terminal-incoming-data', handleIncomingData);
        ipcRenderer.removeListener('terminal-status', handleStatusUpdate);
        console.log(`[${tabId}] IPC listeners removed.`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]); // Dependency on tabId ensures listeners are specific to this tab instance


  // --- Effect 2: Window Resize Listener & Final Terminal Dispose (Runs once on mount) ---
  // Handles fitting the terminal to the container on window resize and disposes xterm instance on unmount
  useEffect(() => {
    console.log(`[${tabId}] TerminalView: Resize Listener & Final Dispose Effect Running (Mount)...`);

    const handleWindowResize = () => {
        if (termInstance.current && terminalRef.current) {
            console.log(`[${tabId}] Window resized, attempting terminal fit.`);
            try {
                fitAddonInstance.current.fit();
                 console.log(`[${tabId}] Terminal fitted on resize.`);
            } catch (e) {
                console.error(`[${tabId}] Error fitting terminal on window resize:`, e);
            }
        }
    };
    window.addEventListener('resize', handleWindowResize);

    // Cleanup function for this effect (runs only on component unmount)
    return () => {
        console.log(`[${tabId}] Cleaning up TerminalView Resize Listener & Final Dispose Effect (Unmount)...`);
        window.removeEventListener('resize', handleWindowResize);
        // Dispose terminal instance if it exists (final cleanup when component unmounts)
        if (termInstance.current) {
            console.log(`[${tabId}] Disposing terminal instance on unmount...`);
            termInstance.current.dispose();
            termInstance.current = null;
            webglAddonInstance.current = null; // Also clear ref for addon
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount and cleans up on unmount


  // --- Effect 3: Focus Terminal when Tab becomes Active ---
  // Ensures the terminal element has keyboard focus when its tab is selected
  useEffect(() => {
      console.log(`[${tabId}] TerminalView: Active Status Effect Running. isActive: ${isActive}`);
      if (isActive && termInstance.current) {
          console.log(`[${tabId}] Tab is active, focusing terminal.`);
          // Use requestAnimationFrame to ensure focus happens after potential reflows
          requestAnimationFrame(() => {
             termInstance.current?.focus();
          });
      }
  }, [tabId, isActive]); // Re-run when tabId or isActive changes


  // --- Effect 4: REMOVED - Manual Keyboard Event Handling ---
  // This effect is removed as xterm.js handles its own keyboard input processing.
  // The correct input handling is via the term.onData listener in Effect 5.


  // --- Effect 5: Session Logic, Terminal Creation/Update, & Term Listeners (Runs on session/state changes) ---
  // Manages the lifecycle of the xterm instance and initiates connections based on session prop.
  useEffect(() => {
    console.log(`[${tabId}] TerminalView: Session/Terminal Logic Effect Running. Session:`, session, "isConnected:", isConnected, "isConnecting:", isConnecting);

    // Listeners for the xterm instance itself
    let dataListenerDisposable: { dispose: () => void } | null = null;
    let resizeListenerDisposable: { dispose: () => void } | null = null;
    let connectTimeoutId: NodeJS.Timeout | null = null; // Store timeout ID
    let initialFocusTimeoutId: NodeJS.Timeout | null = null; // Store initial focus timeout ID

     // --- Terminal Creation/Update ---
     const term = termInstance.current;
     const container = terminalRef.current;

     // Only initialize if there's a session, the container exists, has dimensions, and terminal isn't already created
     // Check container dimensions to ensure it's visible before opening xterm
     if (session && container && container.clientWidth > 0 && container.clientHeight > 0 && !term) {
        console.log(`[${tabId}] Initializing xterm... Container size: ${container.clientWidth}x${container.clientHeight}`);
        try {
          const newTerm = new Terminal({ // Use a new variable name to avoid confusion with ref
            cursorBlink: true,
            convertEol: true,
            fontFamily: 'Consolas, "Courier New", monospace', // Example font
            fontSize: 14, // Example font size
            theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' } // Example theme
          });
          termInstance.current = newTerm; // Assign the new instance to the ref
          console.log(`[${tabId}] Terminal instance created and assigned.`);

          // Load Addons
          newTerm.loadAddon(fitAddonInstance.current);
          newTerm.loadAddon(searchAddonInstance.current);
          try {
              webglAddonInstance.current = new WebglAddon();
              newTerm.loadAddon(webglAddonInstance.current);
              console.log(`[${tabId}] WebglAddon loaded.`);
          } catch (e) {
              console.warn(`[${tabId}] WebglAddon failed to load:`, e);
              webglAddonInstance.current = null; // Ensure ref is null if loading fails
          }
          console.log(`[${tabId}] Addons loaded.`);


          newTerm.open(container); // Open the terminal in the container div
          console.log(`[${tabId}] Terminal opened in DOM.`);

          // Fit terminal initially after it's opened and potentially rendered
          requestAnimationFrame(() => {
            try {
              fitAddonInstance.current.fit();
              console.log(`[${tabId}] Terminal fitted successfully`);
            } catch (e) { console.error(`[${tabId}] Error fitting terminal after open:`, e); }
          });

          // --- Setup term listeners (THE IMPORTANT PART FOR INPUT) ---
          // This listener captures user input from the terminal instance
          dataListenerDisposable = newTerm.onData((data) => {
            console.log(`[${tabId}] xterm.js onData:`, JSON.stringify(data)); // This should log your key presses!
            ipcRenderer.send('terminal-data', { tabId, data }); // Send the captured data to the Main process
          });

          // This listener captures terminal resize events
          resizeListenerDisposable = newTerm.onResize(({ cols, rows }) => {
            // Only send resize event to Main if we are currently connected
            if (isConnectedRef.current) {
              console.log(`[${tabId}] xterm.js onResize:`, { cols, rows });
              ipcRenderer.send('terminal-resize', { tabId, size: { cols, rows } });
            } else {
               console.log(`[${tabId}] Terminal Resize detected (not sending IPC - disconnected):`, { cols, rows });
            }
          });
           // --- End term listeners setup ---


          // Initial focus attempt after a small delay to allow DOM rendering
          initialFocusTimeoutId = setTimeout(() => {
              console.log(`[${tabId}] Attempting initial terminal focus after creation.`);
              newTerm.focus();
          }, 100); // Delay focus slightly


        } catch (e) {
          console.error(`[${tabId}] Error during xterm initialization:`, e);
          termInstance.current = null; // Ensure ref is null if initialization fails
          webglAddonInstance.current = null;
        }
     } else if (!session && term) {
         // Session was removed or became null, clear the terminal and reset state
         console.log(`[${tabId}] Session became null or was removed. Clearing terminal and resetting state.`);
         term.clear(); // Clear terminal content
         // Dispose the terminal instance itself
         term.dispose();
         termInstance.current = null;
         webglAddonInstance.current = null;
         lastSessionKeyRef.current = ''; // Reset session key tracker
         // Reset connection state if it was active
         if (isConnected || isConnecting) {
             setIsConnected(false);
             isConnectedRef.current = false;
             setIsConnecting(false);
         }
     } else if (session && container && (container.clientWidth === 0 || container.clientHeight === 0) && !term) {
         // Container exists but has zero dimensions, likely not visible yet (e.g., tab not active).
         // Defer xterm initialization until dimensions are non-zero.
         console.log(`[${tabId}] Terminal container has zero dimensions. Deferring xterm initialization.`);
         // No action needed, this effect will re-run when dimensions change (e.g., tab becomes active)
     }
     // Note: If a session changes but terminal is already initialized (term exists),
     // the subsequent connection logic below will handle initiating a new connection.
     // The existing terminal instance is reused.
     // --- End Terminal Creation/Update ---


    // --- Connection Logic ---
    // This part handles initiating a connection when a session is provided or changes.
    const currentTerm = termInstance.current; // Use the potentially newly created term instance

    // Determine if a connection attempt should be made
    let shouldConnect = false;
    const hasRequiredSessionInfo = session && session.host && session.username && (session.password); // Add other auth methods if needed

    if (currentTerm && hasRequiredSessionInfo) {
        const newSessionKey = `${session.host}:${session.port || 22}:${session.username}`;
        // Check if session configuration has changed OR if we are currently disconnected and not connecting
        if ((newSessionKey !== lastSessionKeyRef.current) || (!isConnected && !isConnecting)) {
          console.log(`[${tabId}] Connection needed. Reason: ${newSessionKey !== lastSessionKeyRef.current ? 'Session configuration changed' : 'Currently disconnected'}.`);
          shouldConnect = true;
          lastSessionKeyRef.current = newSessionKey; // Update the last used session key *before* connecting
        } else if (isConnecting) {
          console.log(`[${tabId}] Connection attempt already in progress for this session.`);
        } else if (isConnected) {
           console.log(`[${tabId}] Already connected to this session configuration. No connection needed.`);
        }
    } else if (!hasRequiredSessionInfo) {
        console.log(`[${tabId}] Session object is incomplete, cannot connect.`);
         // Optional: Clear terminal and state if session becomes incomplete while connected
         if (isConnected || isConnecting) {
             console.log(`[${tabId}] Session became incomplete while connected/connecting. Clearing.`);
             currentTerm?.clear();
             setIsConnected(false);
             isConnectedRef.current = false;
             setIsConnecting(false);
         }
         lastSessionKeyRef.current = ''; // Reset session key tracker
    } else {
        console.log(`[${tabId}] Terminal instance not ready, cannot initiate connection.`);
    }

    if (shouldConnect && currentTerm && hasRequiredSessionInfo) {
        // Clear any previous connection state and terminal content
        if (isConnected) {
             console.log(`[${tabId}] Disconnecting previous connection before attempting new one.`);
             // Send a disconnect request to Main process
             ipcRenderer.send('terminal-disconnect', { tabId });
             setIsConnected(false);
             isConnectedRef.current = false;
        }
        setIsConnecting(true); // Set state to indicate connection is in progress
        currentTerm.clear(); // Clear the terminal *before* sending connect request
        currentTerm.writeln(`Connecting to ${session.username}@${session.host}:${session.port || 22}...`); // Show connecting message

        // Delay the actual connection attempt slightly to allow UI updates/clearing
        connectTimeoutId = setTimeout(() => {
            console.log(`[${tabId}] Sending 'terminal-connect' IPC message...`);
            ipcRenderer.send('terminal-connect', {
              tabId,
              config: {
                host: session.host,
                port: session.port || 22, // Default to 22 if port is null/undefined
                username: session.username,
                password: session.password, // Pass password, securely handled in Main
                // Add other connection options from SessionProfile here (e.g., privateKey, passphrase, agent, etc.)
              }
            });
        }, 50); // 50ms delay - adjust if needed
    }

    // Cleanup function for *this* effect
    // Disposes the xterm instance listeners when dependencies change
    return () => {
        console.log(`[${tabId}] Cleaning up Session/Terminal Logic Effect...`);
        // Clear timeouts if they are pending
        if (connectTimeoutId) {
            console.log(`[${tabId}]   Clearing connect timeout.`);
            clearTimeout(connectTimeoutId);
        }
        if (initialFocusTimeoutId) {
             console.log(`[${tabId}]   Clearing initial focus timeout.`);
             clearTimeout(initialFocusTimeoutId);
        }
        // Dispose xterm instance listeners attached in this effect
        console.log(`[${tabId}]   Disposing xterm instance listeners...`);
        dataListenerDisposable?.dispose();
        resizeListenerDisposable?.dispose();
        // NOTE: We do *NOT* dispose the main termInstance here.
        // That is handled by Effect 2's cleanup which runs only on component unmount.
        // This ensures the terminal persists across session changes within the same component instance.
    };

  }, [tabId, session]); // Dependencies: Re-run this effect if tabId or the session object changes.
                         // isConnected and isConnecting are managed *by* this effect's logic or IPC handlers,
                         // including them here could lead to infinite loops.


  // --- Conditional Rendering ---
  // Display a message if no session is selected
  if (!session) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#aaa', backgroundColor: '#1e1e1e', fontSize: '1.2rem',
        height: '100%', width: '100%',
      }}>
        Select a session from the sidebar or use the '+' button to start.
      </div>
    );
  }

  // Render the terminal container div if there is a session
  return (
    <div
      ref={terminalRef}
      style={{
        height: '100%', width: '100%', backgroundColor: '#1e1e1e',
        position: 'relative', display: 'flex', flexDirection: 'column'
      }}
    />
  );
};

export default TerminalView;