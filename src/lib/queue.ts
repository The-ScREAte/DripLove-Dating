// Simple queue system for background tasks
class TaskQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  async enqueue(task: () => Promise<void>): Promise<void> {
    console.log('[Queue] Enqueuing new task. Current queue size:', this.queue.length);
    this.queue.push(task);
    if (!this.isProcessing) {
      console.log('[Queue] Starting queue processing...');
      this.processQueue();
    } else {
      console.log('[Queue] Already processing, task will be queued');
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    
    console.log('[Queue] Processing', this.queue.length, 'tasks...');
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          console.log('[Queue] Executing task...');
          await task();
          console.log('[Queue] Task completed successfully');
        } catch (error) {
          console.error('[Queue] Task failed:', error);
          // Continue processing other tasks even if one fails
        }
      }
    }
    
    console.log('[Queue] All tasks processed');
    this.isProcessing = false;
  }
}

const taskQueue = new TaskQueue();

export const enqueue = (task: () => Promise<void>) => {
  return taskQueue.enqueue(task);
};