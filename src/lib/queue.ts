// Simple queue system for background tasks
class TaskQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  async enqueue(task: () => Promise<void>): Promise<void> {
    this.queue.push(task);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('Task failed:', error);
          // Continue processing other tasks even if one fails
        }
      }
    }
    
    this.isProcessing = false;
  }
}

const taskQueue = new TaskQueue();

export const enqueue = (task: () => Promise<void>) => {
  return taskQueue.enqueue(task);
};