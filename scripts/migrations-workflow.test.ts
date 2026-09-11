import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractVersion: extractDevVersion, DEV_PROJECT_ID } = require('./migrate-dev.cjs') as {
  extractVersion: (filename: string) => string;
  DEV_PROJECT_ID: string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractVersion: extractProdVersion, PROD_PROJECT_ID } = require('./promote-migrations.cjs') as {
  extractVersion: (filename: string) => string;
  PROD_PROJECT_ID: string;
};

describe('migrations workflow scripts', () => {
  describe('extractVersion', () => {
    it('extracts numeric timestamp prefix from migration filename', () => {
      expect(extractDevVersion('20260912120000_add_feature.sql')).toBe('20260912120000');
      expect(extractProdVersion('20260912120000_add_feature.sql')).toBe('20260912120000');
    });

    it('throws when filename does not begin with a numeric timestamp', () => {
      expect(() => extractDevVersion('invalid_migration.sql')).toThrow(/numeric timestamp/);
      expect(() => extractProdVersion('invalid_migration.sql')).toThrow(/numeric timestamp/);
    });
  });

  describe('project identifiers', () => {
    it('does not hardcode production or development project references in source code', () => {
      // DEV_PROJECT_ID and PROD_PROJECT_ID must be driven by env vars and not hardcoded strings
      expect(DEV_PROJECT_ID).toBe(process.env.SUPABASE_DEV_PROJECT_ID);
      expect(PROD_PROJECT_ID).toBe(process.env.SUPABASE_PROD_PROJECT_ID);
    });
  });
});
