-- 0001_init: the application's own tables. SAP stays the system of record; these hold what the application keeps
-- itself. Plain SQL types only, so the schema also runs on another database when the application moves to a server.

-- The mock store of each module (used while the module's SAP service URL is not set): its tables and lookups as
-- one JSON document, seeded from the module's sample data on first use.
CREATE TABLE mock_store (
  module_id  TEXT NOT NULL PRIMARY KEY,
  state      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ALV layouts (reports and object lists): shared ones (owner '') and each user's personal ones.
CREATE TABLE layouts (
  module_id   TEXT    NOT NULL,
  scope       TEXT    NOT NULL CHECK (scope IN ('shared', 'personal')),
  owner       TEXT    NOT NULL DEFAULT '',
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  layout      TEXT    NOT NULL,
  changed_by  TEXT    NOT NULL,
  changed_on  TEXT    NOT NULL,
  position    INTEGER NOT NULL,
  PRIMARY KEY (module_id, scope, owner, name)
);
