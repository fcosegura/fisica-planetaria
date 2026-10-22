import { SimulationWorkerRunner } from './worker-runner';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Minimal port typing avoids importing both DOM and WebWorker global libraries.
const port = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
};
const runner = new SimulationWorkerRunner();
port.onmessage = ({ data }) => {
  const response = runner.handle(data);
  const transfer: Transferable[] = [];
  if (response.type === 'state') {
    transfer.push(response.packed.kinematics.buffer as ArrayBuffer);
    if (response.packed.trails) transfer.push(response.packed.trails.positions.buffer as ArrayBuffer);
  }
  port.postMessage(response, transfer);
};
