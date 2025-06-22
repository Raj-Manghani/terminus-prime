import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal, ITerminalOptions } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';

const termTheme: ITerminalOptions['theme'] = { /* ... full theme ... */
  background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: '#264f78',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8',
  magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5', brightBlack: '#666666',
  brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea',
  brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5'
};
const terminalOptions: ITerminalOptions = {
  cursorBlink: true, convertEol: true, fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 15, theme: termTheme, allowProposedApi: true,
};

interface TerminalViewProps {
  onData: (data: string) => void;
  onResize?: (cols: number, rows: number, height: number, width: number) => void;
  dataToDisplay?: string;
  clearTrigger?: number;
  triggerFit?: number;
  isUiElementFocused?: boolean; // New prop
}

const TerminalView: React.FC<TerminalViewProps> = React.memo(({
  onData,
  onResize,
  dataToDisplay,
  clearTrigger,
  triggerFit,
  isUiElementFocused // Destructure new prop
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const fitAndNotifyResize = useCallback(() => { /* ... as before ... */
    if (fitAddonRef.current && termInstanceRef.current && terminalRef.current) {
      try { fitAddonRef.current.fit(); const { cols, rows } = termInstanceRef.current; if (cols > 0 && rows > 0 && onResize) { onResize(cols, rows, terminalRef.current.clientHeight, terminalRef.current.clientWidth); }
      } catch (e) { console.error("TerminalView: Error fitting/notifying resize:", e); }
    }
  }, [onResize]);

  useEffect(() => { // Initialize terminal
    let term: Terminal | null = null;
    if (terminalRef.current && !termInstanceRef.current) {
      term = new Terminal(terminalOptions);
      // ... (rest of init logic as in Subtask 24) ...
      termInstanceRef.current = term; const fitAddon = new FitAddon(); fitAddonRef.current = fitAddon; term.loadAddon(fitAddon);
      try { const webgl = new WebglAddon(); term.loadAddon(webgl); webglAddonRef.current = webgl; } catch (e) { console.warn('WebGL addon failed.', e); }
      term.open(terminalRef.current); fitAddon.fit();

      term.onData((dataFromTerm) => { // Modified onData handler
        if (isUiElementFocused) {
          // console.log("TerminalView: UI has focus, ignoring input to terminal's onData callback.");
          return;
        }
        if (onData) onData(dataFromTerm);
      });

      const parentEl = terminalRef.current.parentElement;
      if (parentEl && onResize) { const obs = new ResizeObserver(fitAndNotifyResize); obs.observe(parentEl); resizeObserverRef.current = obs; setTimeout(fitAndNotifyResize, 50); }
    }
    return () => { /* ... cleanup logic as in Subtask 24 ... */
        resizeObserverRef.current?.disconnect();
        if (webglAddonRef.current) { try { webglAddonRef.current.dispose(); } catch (e) { console.error('Error disposing WebGL addon:', e); } webglAddonRef.current = null; }
        if (fitAddonRef.current) { try { fitAddonRef.current.dispose(); } catch (e) { console.error('Error disposing Fit addon:', e); } fitAddonRef.current = null; }
        if (termInstanceRef.current) { try { termInstanceRef.current.dispose(); } catch (e) { console.error('Error disposing terminal instance:', e); } termInstanceRef.current = null; }
    };
  }, [onData, onResize, fitAndNotifyResize, isUiElementFocused]); // Added isUiElementFocused to deps for onData closure

  useEffect(() => { /* ... dataToDisplay effect ... */
    if (termInstanceRef.current && dataToDisplay !== undefined) termInstanceRef.current.write(dataToDisplay);
  }, [dataToDisplay]);
  useEffect(() => { /* ... clearTrigger effect ... */
    if (termInstanceRef.current && clearTrigger !== undefined && clearTrigger > 0) termInstanceRef.current.clear();
  }, [clearTrigger]);
  useEffect(() => { /* ... triggerFit effect ... */
    if (triggerFit && triggerFit > 0 && fitAddonRef.current && termInstanceRef.current?.element) {
      if (terminalRef.current && terminalRef.current.offsetParent !== null) {
        try { fitAddonRef.current.fit(); } catch (e) { console.error("TerminalView: Error fitting on triggerFit:", e); }
      }
    }
  }, [triggerFit]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%', backgroundColor: termTheme.background }} />;
});
export default TerminalView;
