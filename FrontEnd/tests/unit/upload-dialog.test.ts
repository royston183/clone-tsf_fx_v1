import { describe, expect, it } from 'vitest';
import { latestPick, postedRows, type UploadLine } from '@/components/ui/UploadDialog';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const line = (row: number, gl: string, status: UploadLine['status'] = 'create'): UploadLine => ({ row, status, cells: { gl }, values: { gl } });
const flush = () => new Promise(r => setTimeout(r, 0));

describe('upload dialog: a stale parse never changes what Post sends', () => {
  it('drops an older pick that resolves after the latest one', async () => {
    const settle = latestPick<UploadLine[]>();
    let shown: UploadLine[] = [];
    const a = deferred<UploadLine[]>(), b = deferred<UploadLine[]>();
    settle(a.promise, l => { shown = l; }, () => undefined);
    settle(b.promise, l => { shown = l; }, () => undefined);
    b.resolve([line(2, 'B-400100'), line(3, 'B-999999', 'invalid')]);
    await flush();
    a.resolve([line(2, 'A-500100')]);
    await flush();
    expect(shown.map(l => l.cells.gl)).toEqual(['B-400100', 'B-999999']);
    expect(postedRows(shown)).toEqual([{ gl: 'B-400100' }, { gl: 'B-999999' }]);
  });
  it('drops a stale failure too', async () => {
    const settle = latestPick<UploadLine[]>();
    let error = '';
    const a = deferred<UploadLine[]>();
    let rejectA!: (e: Error) => void;
    const failing = new Promise<UploadLine[]>((_, rej) => { rejectA = rej; });
    settle(failing, () => undefined, e => { error = e.message; });
    settle(a.promise, () => undefined, e => { error = e.message; });
    a.resolve([]);
    rejectA(new Error('old file'));
    await flush();
    expect(error).toBe('');
  });
  it('posts the values of every line on screen, in file order', () => {
    expect(postedRows([line(2, 'x'), line(3, 'y', 'invalid'), { row: 4, status: 'update', cells: {} }])).toEqual([{ gl: 'x' }, { gl: 'y' }]);
  });
});
