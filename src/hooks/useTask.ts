import { useCallback, useEffect, useRef, useState } from 'react';
import { StoppedError } from '../services/dataverse';

export interface BusyState {
    title: string;
    text?: string;
    started: number;
}

type Action<T> = (signal: AbortSignal, progress: (text: string) => void) => Promise<T>;

/**
 * One task at a time behind the loading popup (replaces WorkAsync). Stop, Esc or a connection change cancel it:
 * the hand is given back at once and whatever the task returns afterwards is ignored.
 */
export function useTask(onError: (error: unknown) => void, onStopped: () => void) {
    const [busy, setBusy] = useState<BusyState | null>(null);
    const [, setTick] = useState(0);
    const current = useRef<AbortController | null>(null);
    const handlers = useRef({ onError, onStopped });
    handlers.current = { onError, onStopped };

    const run = useCallback(async <T,>(title: string, action: Action<T>): Promise<T | undefined> => {
        if (current.current) return undefined;
        const controller = new AbortController();
        current.current = controller;
        setBusy({ title, started: Date.now() });
        const active = () => current.current === controller;
        try {
            const result = await action(controller.signal, (text) => active() && setBusy((state) => state && { ...state, text }));
            return active() ? result : undefined;
        } catch (error) {
            if (active() && !(error instanceof StoppedError)) {
                console.error(`Entity Fields Analyzer: ${title}`, error);
                handlers.current.onError(error);
            }
            return undefined;
        } finally {
            if (active()) {
                current.current = null;
                setBusy(null);
            }
        }
    }, []);

    const cancel = useCallback(() => {
        const controller = current.current;
        if (!controller) return false;
        current.current = null;
        setBusy(null);
        controller.abort();
        return true;
    }, []);

    const stop = useCallback(() => {
        if (cancel()) handlers.current.onStopped();
    }, [cancel]);

    // Elapsed time of the popup; Esc stops the task.
    const running = !!busy;
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => setTick((t) => t + 1), 1000);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop();
        window.addEventListener('keydown', onKey);
        return () => {
            clearInterval(timer);
            window.removeEventListener('keydown', onKey);
        };
    }, [running, stop]);

    return { busy, run, stop, cancel };
}
