import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenarioInput, SimulationResult, SimulationParams, WorkerMessage } from '../types';

interface UseSimulationReturn {
  result: SimulationResult | null;
  progress: number; // 0-100
  isRunning: boolean;
  error: string | null;
  run: (scenario: ScenarioInput, params?: Partial<SimulationParams>) => void;
  cancel: () => void;
}

export function useSimulation(): UseSimulationReturn {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsRunning(false);
    setProgress(0);
  }, []);

  const run = useCallback((scenario: ScenarioInput, params?: Partial<SimulationParams>) => {
    cancel();
    setError(null);
    setResult(null);
    setProgress(0);
    setIsRunning(true);

    const worker = new Worker(
      new URL('../engine/simulation.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress':
          setProgress(Math.round((msg.completed / msg.total) * 100));
          break;
        case 'complete':
          setResult(msg.result);
          setIsRunning(false);
          setProgress(100);
          worker.terminate();
          workerRef.current = null;
          break;
        case 'error':
          setError(msg.message);
          setIsRunning(false);
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.onerror = (e) => {
      console.error('[Worker onerror]', e);
      console.error('[Worker onerror] message:', e.message);
      console.error('[Worker onerror] filename:', e.filename);
      console.error('[Worker onerror] lineno:', e.lineno);
      setError(e.message || 'Worker error');
      setIsRunning(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({
      type: 'run',
      scenario,
      params: {
        numSimulations: params?.numSimulations ?? 5000,
        seed: params?.seed,
      },
    });
  }, [cancel]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return { result, progress, isRunning, error, run, cancel };
}
