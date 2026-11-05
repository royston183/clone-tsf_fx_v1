-- 0002_app_store: the per-module store holds the application's own data (modules with source 'app'), no longer a
-- mock of SAP. Modules on sample data keep theirs in memory; SAP modules keep theirs in SAP.
ALTER TABLE mock_store RENAME TO app_store;
