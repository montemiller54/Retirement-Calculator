import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenarioInput, SimulationResult, SimulationParams, WorkerMessage } from '../types';

interface UseSimulationReturn {
  result: SimulationResult | null;
  progress: number; // 0-100
  isRunning: boolean;
  error: string | null;
  lastRunScenario: ScenarioInput | null;
  lastRunAt: number | null;
  run: (scenario: ScenarioInput, params?: Partial<SimulationParams>) => void;
  cancel: () => void;
}

export function useSimulation(): UseSimulationReturn {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunScenario, setLastRunScenario] = useState<ScenarioInput | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const retriesRef = useRef(0);
  const MAX_RETRIES = 2;

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    retriesRef.current = 0;
    setIsRunning(false);
    setProgress(0);
  }, []);

  const run = useCallback((scenario: ScenarioInput, params?: Partial<SimulationParams>) => {
    cancel();
    setError(null);
    setResult(null);
    setProgress(0);
    setIsRunning(true);
    retriesRef.current = 0;
    const scenarioSnapshot = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;

    const startWorker = () => {
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
            setLastRunScenario(scenarioSnapshot);
            setLastRunAt(Date.now());
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
        worker.terminate();
        workerRef.current = null;

        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current += 1;
          console.warn(`[Worker] Retrying... attempt ${retriesRef.current}/${MAX_RETRIES}`);
          setTimeout(startWorker, 500);
        } else {
          setError('Simulation failed to start. Please reload the page and try again.');
          setIsRunning(false);
        }
      };

      worker.postMessage({
        type: 'run',
        scenario,
        params: {
          numSimulations: params?.numSimulations ?? 5000,
          seed: params?.seed,
        },
      });
    };

    startWorker();
  }, [cancel]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return { result, progress, isRunning, error, lastRunScenario, lastRunAt, run, cancel };
}
