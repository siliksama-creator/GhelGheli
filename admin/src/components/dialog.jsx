import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button, Input, Textarea } from './ui.jsx';

// Replaces every `window.prompt(...)` / `window.confirm(...)` call from the
// legacy admin with a proper on-brand modal dialog, while keeping the same
// call-site ergonomics: `await promptText('...')` resolves to the value or
// null, just like `prompt()` used to.
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((value) => {
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const promptText = useCallback((opts) => {
    const config = typeof opts === 'string' ? { title: opts } : opts;
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ kind: 'prompt', ...config, value: config.defaultValue || '' });
    });
  }, []);

  const confirmAction = useCallback((opts) => {
    const config = typeof opts === 'string' ? { title: opts } : opts;
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ kind: 'confirm', ...config });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ promptText, confirmAction }}>
      {children}
      {state && <DialogModal state={state} onClose={close} setState={setState} />}
    </DialogContext.Provider>
  );
}

function DialogModal({ state, onClose, setState }) {
  const isPrompt = state.kind === 'prompt';
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose(isPrompt ? null : false)}>
      <div className="modal-card">
        <div className="modal-title">{state.title}</div>
        {state.description && <p style={{ marginBottom: 12 }}>{state.description}</p>}
        {isPrompt &&
          (state.multiline ? (
            <Textarea
              autoFocus
              rows={4}
              value={state.value}
              placeholder={state.placeholder}
              onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))}
            />
          ) : (
            <Input
              autoFocus
              type={state.type || 'text'}
              value={state.value}
              placeholder={state.placeholder}
              onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && onClose(state.value)}
            />
          ))}
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => onClose(isPrompt ? null : false)}>
            انصراف
          </Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => onClose(isPrompt ? state.value : true)}>
            {state.confirmLabel || (isPrompt ? 'ثبت' : 'تایید')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
