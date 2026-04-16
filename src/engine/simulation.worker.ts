import type { WorkerRequest, WorkerMessage } from '../types';
import { runSimulation } from './simulation';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { scenario, params } = e.data;
  console.log('[Worker] received message, currentAge:', scenario.currentAge, 'retirementAge:', scenario.retirementAge);
  try {
    const result = runSimulation(scenario, params, (completed, total) => {
      const msg: WorkerMessage = { type: 'progress', completed, total };
      self.postMessage(msg);
    });
    const msg: WorkerMessage = { type: 'complete', result };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
