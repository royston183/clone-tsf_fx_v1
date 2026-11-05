-- 0003_app_modules: the app modules already seeded with their sample data, so a module whose rows were all deleted
-- is not seeded again. Each module's own data lives in its generated tables (<module>__<table>, npm run gen-schema).
CREATE TABLE app_modules (
  module_id VARCHAR(100) NOT NULL PRIMARY KEY,
  seeded_at VARCHAR(30)  NOT NULL
);
