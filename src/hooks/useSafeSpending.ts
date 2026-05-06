import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenarioInput, SafeSpendingResult, WorkerMessage } from '../types';

interface UseSafeSpendingReturn {
  result: SafeSpendingResult | null;
  progress: number;
  isRunning: boolean;
  error: string | null;
  run: (scenario: ScenarioInput, targetSuccessRate: number) => void;
  cancel: () => void;
}

export function useSafeSpending(): UseSafeSpendingReturn {
  const [result, setResult] = useState<SafeSpendingResult | null>(null);
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

  const run = useCallback((scenario: ScenarioInput, targetSuccessRate: number) => {
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
        case 'safeSpendingComplete':
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

    worker.onerror = () => {
      setError('Safe spending calculation failed. Please reload and try again.');
      setIsRunning(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({
      type: 'findSafeSpending',
      scenario,
      targetSuccessRate,
    });
  }, [cancel]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return { result, progress, isRunning, error, run, cancel };
}
