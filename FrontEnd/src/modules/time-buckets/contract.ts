import type { ODataContract } from '../types';

// OData V4 contract, live on DS4_100_TFSIN since 2026-09-26 (from ALM config/timebuckets-odata.json).
// Service binding ZFS_SB_ALMTIMEBKT_O4_API, root (SAP_TIMEBUCKETS_URL):
//   https://vhtfqds4ap01.sap.tfsin.co.in:44300/sap/opu/odata4/sap/zfs_sb_almtimebkt_o4_api/srvd_a2x/sap/zfs_sd_almtimebkt/0001/
// Tables /FS00/ALMTR004 (ALM 1) and /FS00/ALMTR005 (ALM 2/3), key Bucket. Fields map to PascalCase
// (fromNo → FromNo); only the stamps differ. FrequencyDomain lists domain /FS00/ALMDM0001 for ZFR_TP and ZTO_TP.
const STAMPS = { enteredBy: 'CreatedBy', enteredOn: 'CreatedDate', entryTime: 'CreatedTime', changedBy: 'ChangedBy', changedOn: 'ChangedDate', changedTime: 'ChangedTime' };

export const contract: ODataContract = {
  service: 'ZFS_SB_ALMTIMEBKT_O4_API',
  naming: 'pascal',
  pageSize: 5000,
  etag: true,
  tables: {
    alm1: { entitySet: 'Alm1Bucket', fields: STAMPS },
    alm2: { entitySet: 'Alm2Bucket', fields: STAMPS }
  },
  lookups: {
    freqDomain: { entitySet: 'FrequencyDomain', fields: { field: 'DomainField', value: 'Value', text: 'Text' } }
  }
};
