import { describe, expect, it } from 'vitest';
import { amountInWords, invoicePdf, longDate, salesDocPdf, type PdfLeg } from '@/ref/features/mo-generate-invoices-deal-id/invoice-pdf';

const leg: PdfLeg = {
  dealId: '7000000035', dealDesc: 'Iqbal M_OSIPL_2025/OGA-OSIPL-DMCC', legId: 'T1', invNo: '9232004787', invDate: '2026-08-06', soNo: '9079006131', soDate: '2026-07-16',
  masterContract: '5367125747', sellerCode: 'DMCC', buyerCode: 'OGA', dueDate: '2027-03-24', incoterms: 'Free on board', commodity: 'Brazilian Soybeans', material: 'C132',
  qty: 31212.1, rate: 44134.37, amount: 1377526369.88, currency: 'INR'
};
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
    const t = asText(invoicePdf(leg));
    expect(t.startsWith('%PDF-1.4')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(t).toContain('9232004787 / 06 AUG 2026');
    expect(t).toContain('1,377,526,369.88');
    expect(t).toContain('OLAM INTERNATIONAL FZCO');
  });
  it('makes the two-page sales document', () => {
    const t = asText(salesDocPdf(leg));
    expect(t).toContain('/Count 2');
    expect(t).toContain('9079006131');
    expect(t).toContain('31,212.100 MT');
  });
});
