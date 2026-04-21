import type { WorkerRequest, WorkerMessage } from '../types';
import { runSimulation } from './simulation';

// Catch any uncaught errors at the worker global level
self.addEventListener('error', (e) => {
  console.error('[Worker global error]', e.message, e.filename, e.lineno, e.error);
});

self.addEventListener('unhandledrejection', (e) => {
  console.error('[Worker unhandled rejection]', e.reason);
});

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { scenario, params } = e.data;
  console.log('[Worker] received message, currentAge:', scenario.currentAge, 'retirementAge:', scenario.retirementAge);
  console.log('[Worker] partTimeIncome:', JSON.stringify(scenario.partTimeIncome));
  console.log('[Worker] housing:', JSON.stringify(scenario.housing));
  try {
    const result = runSimulation(scenario, params, (completed, total) => {
      const msg: WorkerMessage = { type: 'progress', completed, total };
      self.postMessage(msg);
    });
    console.log('[Worker] simulation complete, posting result');
    const msg: WorkerMessage = { type: 'complete', result };
    self.postMessage(msg);
  } catch (err) {
    console.error('[Worker] caught error:', err);
    const stack = err instanceof Error ? err.stack : '';
    const msg: WorkerMessage = {
      type: 'error',
      message: (err instanceof Error ? err.message : String(err)) + '\n' + stack,
    };
    self.postMessage(msg);
  }
};
