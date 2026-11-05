// The template's transaction source: the Transaction set of ZFS_SB_TRMPOSVAL26E_O4_API on NIIF (services.json key
// `trm-transactions`), read in this page through the SAP relay with the tab's SAP account. It answers every company code
// and number, so it stays last: the sources an application adds in front of it answer theirs first.
import { newSapConnection } from '@core/sap/client';
import { sapServiceOf } from '@core/sap/config';
import { readSecurityClass, readTransaction, type TrmSap } from '@core/sap/trm-transaction';
import { buildConfig, sapConnection, sapSettings } from '@/lib/client/sap-account';
import type { TransactionSource } from './sources';

/** The key of the NIIF Transaction service in src/config/services.json. */
export const TRM_SERVICE = 'trm-transactions';

// Without a SAP account the read says so ("No SAP account is set for this session").
const sap = (): TrmSap => ({ settings: sapSettings(), conn: sapConnection() ?? newSapConnection('', ''), service: sapServiceOf(buildConfig(), TRM_SERVICE) });

export const niifTransactions: TransactionSource = {
  id: 'niif',
  matches: () => true,
  read: target => readTransaction(sap(), target),
  readClass: target => readSecurityClass(sap(), target)
};
