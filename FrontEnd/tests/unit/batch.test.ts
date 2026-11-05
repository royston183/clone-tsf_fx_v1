import { describe, expect, it } from 'vitest';
import { buildBatch, parseBatch } from '@core/sap/batch';

const nl = '\r\n';

describe('buildBatch', () => {
  it('writes one changeset with POST, PATCH and DELETE parts', () => {
    const { contentType, body } = buildBatch([
      { method: 'POST', path: 'Alm1Bucket', body: { Bucket: 'B09' } },
      { method: 'PATCH', path: "Alm1Bucket(Bucket='B01')", body: { Description: 'x' }, etag: 'W/"7"' },
      { method: 'DELETE', path: "Alm1Bucket(Bucket='B02')", etag: '*' }
    ], 'batch_t', 'changeset_t');
    expect(contentType).toBe('multipart/mixed; boundary=batch_t');
    expect(body).toBe(
      `--batch_t${nl}Content-Type: multipart/mixed; boundary=changeset_t${nl}${nl}` +
      `--changeset_t${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: 1${nl}${nl}` +
      `POST Alm1Bucket HTTP/1.1${nl}Content-Type: application/json${nl}Accept: application/json${nl}${nl}{"Bucket":"B09"}${nl}` +
      `--changeset_t${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: 2${nl}${nl}` +
      `PATCH Alm1Bucket(Bucket='B01') HTTP/1.1${nl}Content-Type: application/json${nl}Accept: application/json${nl}If-Match: W/"7"${nl}${nl}{"Description":"x"}${nl}` +
      `--changeset_t${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: 3${nl}${nl}` +
      `DELETE Alm1Bucket(Bucket='B02') HTTP/1.1${nl}Accept: application/json${nl}If-Match: *${nl}${nl}${nl}` +
      `--changeset_t--${nl}--batch_t--${nl}`
    );
  });
  it('uses unique boundaries by default', () => {
    expect(buildBatch([]).contentType).toMatch(/^multipart\/mixed; boundary=batch_[0-9a-f-]{36}$/);
  });
});

describe('parseBatch', () => {
  it('reads a successful changeset', () => {
    const text = `--b${nl}Content-Type: multipart/mixed; boundary=c${nl}${nl}--c${nl}Content-Type: application/http${nl}${nl}HTTP/1.1 201 Created${nl}Content-Type: application/json${nl}${nl}{"Bucket":"B09"}${nl}--c${nl}Content-Type: application/http${nl}${nl}HTTP/1.1 204 No Content${nl}${nl}${nl}--c--${nl}--b--${nl}`;
    expect(parseBatch(text)).toEqual({ statuses: [201, 204], ok: true, message: '', bodies: [{ Bucket: 'B09' }, null] });
  });
  it('reads a failed changeset and its SAP message', () => {
    const text = `--b${nl}Content-Type: application/http${nl}${nl}HTTP/1.1 400 Bad Request${nl}Content-Type: application/json${nl}${nl}{"error":{"code":"X","message":"Bucket B09 already exists"}}${nl}--b--${nl}`;
    expect(parseBatch(text)).toEqual({ statuses: [400], ok: false, message: 'Bucket B09 already exists', bodies: [null] });
  });
  it('is not ok without any part', () => expect(parseBatch('').ok).toBe(false));
});
