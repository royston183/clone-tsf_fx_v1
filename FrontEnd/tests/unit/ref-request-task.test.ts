import { describe, expect, it, vi } from 'vitest';
import { requestTask } from '@/ref/shared/request-task';

describe('reference request lifecycle', () => {
  it('cancels a queued request when the screen leaves or StrictMode probes the effect', async () => {
    const start = vi.fn();
    const cancel = requestTask(start);
    cancel();
    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
  });

  it('cleans up a running request when its inputs change', async () => {
    const abort = vi.fn();
    const start = vi.fn(() => abort);
    const cancel = requestTask(start);
    await Promise.resolve();
    expect(start).toHaveBeenCalledOnce();
    cancel();
    expect(abort).toHaveBeenCalledOnce();
  });
});
