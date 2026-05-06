import type { WorkerRequest, WorkerMessage } from '../types';
import { runSimulation, findSafeSpending } from './simulation';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'findSafeSpending') {
      const result = findSafeSpending(req.scenario, req.targetSuccessRate, (completed, total) => {
        const msg: WorkerMessage = { type: 'progress', completed, total };
        self.postMessage(msg);
      });
      const msg: WorkerMessage = { type: 'safeSpendingComplete', result };
      self.postMessage(msg);
    } else {
      const result = runSimulation(req.scenario, req.params, (completed, total) => {
        const msg: WorkerMessage = { type: 'progress', completed, total };
        self.postMessage(msg);
      });
      const msg: WorkerMessage = { type: 'complete', result };
      self.postMessage(msg);
    }
  } catch (err) {
    const msg: WorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
