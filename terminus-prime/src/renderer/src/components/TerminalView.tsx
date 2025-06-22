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
}

const TerminalView: React.FC<TerminalViewProps> = React.memo(({
  onData,
  onResize,
  dataToDisplay,
  clearTrigger,
  triggerFit
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null); // Ref for WebGL addon
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const fitAndNotifyResize = useCallback(() => {
    if (fitAddonRef.current && termInstanceRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = termInstanceRef.current;
        if (cols > 0 && rows > 0 && onResize) {
          onResize(cols, rows, terminalRef.current.clientHeight, terminalRef.current.clientWidth);
        }
      } catch (e) { console.error("TerminalView: Error fitting/notifying resize:", e); }
    }
  }, [onResize]);

  useEffect(() => { // Initialize terminal
    let term: Terminal | null = null; // To use in cleanup only if successfully created
    let fitAddonInst: FitAddon | null = null;
    let webglAddonInst: WebglAddon | null = null;
    let obs: ResizeObserver | null = null;

    if (terminalRef.current && !termInstanceRef.current) {
      console.log("TerminalView: Initializing new xterm instance.");
      term = new Terminal(terminalOptions);
      fitAddonInst = new FitAddon();

      termInstanceRef.current = term;
      fitAddonRef.current = fitAddonInst;
      term.loadAddon(fitAddonInst);

      try {
        webglAddonInst = new WebglAddon();
        term.loadAddon(webglAddonInst);
        webglAddonRef.current = webglAddonInst; // Store in ref
        console.log("TerminalView: WebGL addon loaded.");
      }
      catch (e) { console.warn('TerminalView: WebGL addon failed to load.', e); }

      term.open(terminalRef.current);
      fitAddonInst.fit();
      term.onData(onData);

      const parentEl = terminalRef.current.parentElement;
      if (parentEl && onResize) {
        obs = new ResizeObserver(fitAndNotifyResize);
        obs.observe(parentEl);
        resizeObserverRef.current = obs;
        setTimeout(fitAndNotifyResize, 50);
      }
    }
    return () => { // Cleanup on unmount
      console.log("TerminalView: Cleanup initiated.");
      resizeObserverRef.current?.disconnect();

      if (webglAddonRef.current) {
        try { webglAddonRef.current.dispose(); console.log('TerminalView: WebGL addon disposed.'); }
        catch (e) { console.error('TerminalView: Error disposing WebGL addon:', e); }
        webglAddonRef.current = null;
      }
      if (fitAddonRef.current) {
        try { fitAddonRef.current.dispose(); console.log('TerminalView: Fit addon disposed.'); }
        catch (e) { console.error('TerminalView: Error disposing Fit addon:', e); }
        fitAddonRef.current = null;
      }
      if (termInstanceRef.current) { // Check if it was set
        try { termInstanceRef.current.dispose(); console.log('TerminalView: Terminal instance disposed.'); }
        catch (e) { console.error('TerminalView: Error disposing terminal instance:', e); }
        termInstanceRef.current = null;
      }
      console.log("TerminalView: Cleanup finished.");
    };
  }, [onData, onResize, fitAndNotifyResize]); // Main init effect dependencies

  useEffect(() => { // Handle incoming data
    if (termInstanceRef.current && dataToDisplay !== undefined) {
      termInstanceRef.current.write(dataToDisplay);
    }
  }, [dataToDisplay]);

  useEffect(() => { // Handle clear trigger
    if (termInstanceRef.current && clearTrigger !== undefined && clearTrigger > 0) {
      termInstanceRef.current.clear();
    }
  }, [clearTrigger]);

  useEffect(() => { // Handle external fit trigger
    if (triggerFit && triggerFit > 0 && fitAddonRef.current) {
      // console.log('TerminalView: fit triggered by prop change', triggerFit);
      try { fitAddonRef.current.fit(); }
      catch(e) { console.error("TerminalView: Error fitting on triggerFit:", e); }
    }
  }, [triggerFit]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%', backgroundColor: termTheme.background }} />;
});
export default TerminalView;
