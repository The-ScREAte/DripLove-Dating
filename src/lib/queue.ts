// Lightweight async job queue used for background RPCs (enqueue jobs to run sequentially)
type Job = () => Promise<void>;
const q: Job[] = [];
let running = false;

export function enqueue(job: Job) {
  q.push(job);
  if (!running) drain();
}

async function drain() {
  running = true;
  while (q.length) {
    const job = q.shift()!;
    try {
      await job();
    } catch (e) {
      // Swallow errors - jobs should handle their own error reporting
    }
    // yield to event loop briefly
    await new Promise(res => setTimeout(res, 10));
  }
  running = false;
}

export default { enqueue };
