import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedDashboard, clearDashboardCache } from '@/lib/client/dashboard-cache';
afterEach(() => { clearDashboardCache(); vi.useRealTimers(); });
describe('Overview result cache', () => {
  it('shares concurrent reads and expires after 30 seconds; Refresh clears it', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ total: 12 }));
    await Promise.all([cachedDashboard('company A', load), cachedDashboard('company A', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await cachedDashboard('company B', load);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    await cachedDashboard('company A', load);
    expect(load).toHaveBeenCalledTimes(3);
    clearDashboardCache();
    await cachedDashboard('company A', load);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it('does not retain a failed read', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce('ready');
    await expect(cachedDashboard('home', load)).rejects.toThrow('Unavailable');
    await expect(cachedDashboard('home', load)).resolves.toBe('ready');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
