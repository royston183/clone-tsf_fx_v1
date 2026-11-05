// Sample FX transactions for tests (the module reads SAP through the relay).
import type { ModuleSeed } from '../types';

export const fxTransactionSeed = (): ModuleSeed => ({
  tables: {
    transactions: [
      { companyCode: 'SG03', financialTransaction: '2000000000001', productType: 'T60', transactionType: 'TT6', partner: '400000003', buyCurrency: 'USD', buyAmount: '100000.00', sellCurrency: 'INR', sellAmount: '9600000.00', valueDate: '2026-11-26', activityCategory: '20' }
    ]
  }
});
