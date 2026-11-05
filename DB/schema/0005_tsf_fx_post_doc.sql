-- 0005_tsf_fx_post_doc: written by hand (not a module table, so gen-schema leaves it alone). The reference screens' own
-- table behind /api/ref/localdb/tsf-fx-post-doc: the FI documents PostFlows returned for an FX deal leg (BO: Post
-- Accounting Entries for Settlement), kept so FI Doc 1 / 2 show after a reload. SAP keeps them in BKPF, which has no
-- middleware resource. One row per company code + financial transaction; every number is one SAP returned.
-- Plain SQL types only: the same file runs on MySQL.
CREATE TABLE tsf_fx_post_doc (
  zbukrs        VARCHAR(4)   NOT NULL,            -- Company Code
  zrfha         VARCHAR(13)  NOT NULL,            -- Financial Transaction
  zdoc1         VARCHAR(10)  NOT NULL DEFAULT '', -- FI Doc 1 (BELNR)
  zgjahr1       VARCHAR(4)   NOT NULL DEFAULT '', -- Fiscal Year of Doc 1
  zdoc2         VARCHAR(10)  NOT NULL DEFAULT '', -- FI Doc 2 (BELNR)
  zgjahr2       VARCHAR(4)   NOT NULL DEFAULT '', -- Fiscal Year of Doc 2
  zmsg          VARCHAR(255) NOT NULL DEFAULT '', -- Posting message
  zcreated_by   VARCHAR(12)  NOT NULL DEFAULT '', -- Entered By
  zcreated_date VARCHAR(8)   NOT NULL DEFAULT '', -- Entered On (YYYYMMDD)
  zcreated_time VARCHAR(6)   NOT NULL DEFAULT '', -- Entry Time (HHMMSS)
  zchanged_by   VARCHAR(12)  NOT NULL DEFAULT '', -- Last Changed By
  zchanged_date VARCHAR(8)   NOT NULL DEFAULT '', -- Changed On
  zchanged_time VARCHAR(6)   NOT NULL DEFAULT '', -- Time Changed
  PRIMARY KEY (zbukrs, zrfha)
);
