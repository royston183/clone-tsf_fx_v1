import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { amountInWords, invoicePdf, longDate, salesDocPdf, type PdfLeg } from '@/ref/features/mo-generate-invoices-deal-id/invoice-pdf';

const leg: PdfLeg = {
  dealId: '7000000035', dealDesc: 'Iqbal M_OSIPL_2025/OGA-OSIPL-DMCC', legId: 'T1', invNo: '9232004787', invDate: '2026-08-06', soNo: '9079006131', soDate: '2026-07-16',
  masterContract: '5367125747', sellerCode: 'DMCC', buyerCode: 'OGA', dueDate: '2027-03-24', incoterms: 'Free on board', commodity: 'Brazilian Soybeans', material: 'C132',
  qty: 31212.1, rate: 44134.37, amount: 1377526369.88, currency: 'INR'
};
const companies = { DMCC: { entity: 'DMCC', companyCode: 'AE13', name: 'Test Company DMCC', country: 'AE' }, OGA: { entity: 'OGA', companyCode: 'SG03', name: 'Test Company OGA Pte', country: 'SG' } };
const asText = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('');

describe('the invoice documents', () => {
  it('writes the amount in words as the reference invoice does', () => {
    expect(amountInWords(1377526369.88, 'INR')).toBe('RUPEE ONE BILLION THREE HUNDRED SEVENTY-SEVEN MILLION FIVE HUNDRED TWENTY-SIX THOUSAND THREE HUNDRED SIXTY-NINE AND PAISE EIGHTY-EIGHT ONLY');
  });
  it('formats dates like the reference', () => {
    expect(longDate('2026-08-06')).toBe('06 AUG 2026');
    expect(longDate('24-03-2027')).toBe('24 MAR 2027');
    expect(longDate('')).toBe('');
  });
  it('makes a valid PDF of the invoice with its numbers', () => {
    const t = asText(invoicePdf(leg, undefined, companies));
    expect(t.startsWith('%PDF-1.4')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(t).toContain('9232004787 / 06 AUG 2026');
    expect(t).toContain('1,377,526,369.88');
    expect(t).toContain('Olam Food Ingredients DMC');
    expect(t).not.toContain('Company code');
    expect(t).not.toContain('Mazaya');
  });
  it('makes the two-page sales document', () => {
    const t = asText(salesDocPdf(leg, undefined, companies));
    expect(t).toContain('/Count 2');
    expect(t).toContain('9079006131');
    expect(t).toContain('31,212.100 MT');
  });
});

describe('ofi branding', () => {

  const jpg = new Uint8Array(fs.readFileSync(new URL('../../src/assets/branding/ofi-logo.jpg', import.meta.url)));
  const logo = { bytes: jpg, width: 701, height: 501, crop: { x: 125, y: 55, w: 410, h: 385 } };
  const leg: PdfLeg = {
    dealId: '7000000083', dealDesc: '', legId: 'T1', invNo: '6000000178', invDate: '2026-11-09', soNo: '7000000083-T1', soDate: '2026-11-07', masterContract: 'OGA-DMCC-S',
    sellerCode: 'OGA', buyerCode: 'DMCC', dueDate: '2026-12-09', incoterms: '', commodity: 'Cocoa Liquor', material: 'C131', qty: 83316.142, rate: 106.44, amount: 8868170.15, currency: 'INR'
  };
  it('embeds the logo as a JPEG image, once, and not the old Olam wordmark', () => {
    const t = asText(invoicePdf(leg, logo, companies));
    expect(t).toContain('/Subtype /Image');
    expect(t).toContain('/Filter /DCTDecode');
    expect(t).toContain(`/Length ${jpg.length}`);
    expect(t).toContain('/XObject');
    expect(t).not.toContain('(Olam Agri)');
    const doc = asText(salesDocPdf(leg, logo, companies));
    expect(doc.match(/\/Subtype \/Image/g)?.length).toBe(1);
    expect(doc).toContain('/Count 2');
  });
  it('prints the company names SAP holds for the entities, and says so for one it does not know', () => {
    const t = asText(invoicePdf(leg, logo, companies));
    expect(t).toContain('OLAM International Ltd');
    expect(asText(invoicePdf({ ...leg, buyerCode: 'OSIPL' }, logo, companies))).toContain('Olam Food Ingd. India Pvt.');
    expect(asText(invoicePdf({ ...leg, buyerCode: 'ZZZ' }, logo, { ZZZ: { entity: 'ZZZ', companyCode: 'X1', name: 'Name From SAP', country: 'XX' } }))).toContain('Name From SAP');
  });
});
