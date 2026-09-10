import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveVersion, syncAppVersion, syncNativeVersions } = require('./sync-app-version-from-tag.cjs') as {
  resolveVersion: (tag: string) => string;
  syncAppVersion: (appJsonPath: string, version: string) => boolean;
  syncNativeVersions: (root: string, version: string) => boolean;
};

const fixture = (version: string) =>
  `{\n  "expo": {\n    "name": "Vasuli",\n    "version": "${version}",\n    "ios": { "buildNumber": "58" }\n  }\n}\n`;

function tempAppJson(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'vasuli-version-'));
  const file = join(dir, 'app.json');
  writeFileSync(file, fixture(version));
  return file;
}

describe('sync-app-version-from-tag', () => {
  it('strips a leading v from the tag', () => {
    expect(resolveVersion('v1.0.27')).toBe('1.0.27');
    expect(resolveVersion('1.0.27')).toBe('1.0.27');
  });

  it('rejects non-semver tags so bad tags fail fast', () => {
    expect(() => resolveVersion('v-next')).toThrow(/semver/);
    expect(() => resolveVersion('')).toThrow(/semver/);
    expect(() => resolveVersion('v1.0')).toThrow(/semver/);
  });

  it('rewrites expo.version to the tag version, preserving the rest of the file', () => {
    const file = tempAppJson('1.0.26');
    expect(syncAppVersion(file, '1.0.27')).toBe(true);
    const raw = readFileSync(file, 'utf8');
    expect(raw).toContain('"version": "1.0.27"');
    expect(raw).toContain('"buildNumber": "58"');
    expect(raw).toContain('"name": "Vasuli"');
  });

  it('is a no-op when app.json already matches the tag', () => {
    const file = tempAppJson('1.0.27');
    expect(syncAppVersion(file, '1.0.27')).toBe(false);
    expect(readFileSync(file, 'utf8')).toContain('"version": "1.0.27"');
  });

  it('keeps checked-in native marketing and runtime versions aligned', () => {
    const root = mkdtempSync(join(tmpdir(), 'vasuli-native-version-'));
    const ios = join(root, 'ios/Vasuli');
    const android = join(root, 'android/app/src/main/res/values');
    mkdirSync(join(ios, 'Supporting'), { recursive: true });
    mkdirSync(android, { recursive: true });
    writeFileSync(join(ios, 'Info.plist'), '<key>CFBundleShortVersionString</key>\n<string>1.0.20</string>');
    writeFileSync(join(ios, 'Supporting/Expo.plist'), '<key>EXUpdatesRuntimeVersion</key>\n<string>1.0.20</string>');
    mkdirSync(join(root, 'android/app'), { recursive: true });
    writeFileSync(join(root, 'android/app/build.gradle'), 'versionName "1.0.18"');
    writeFileSync(join(android, 'strings.xml'), '<string name="expo_runtime_version">1.0.18</string>');

    expect(syncNativeVersions(root, '1.0.25')).toBe(true);
    expect(readFileSync(join(ios, 'Info.plist'), 'utf8')).toContain('<string>1.0.25</string>');
    expect(readFileSync(join(ios, 'Supporting/Expo.plist'), 'utf8')).toContain('<string>1.0.25</string>');
    expect(readFileSync(join(root, 'android/app/build.gradle'), 'utf8')).toContain('versionName "1.0.25"');
    expect(readFileSync(join(android, 'strings.xml'), 'utf8')).toContain('>1.0.25</string>');
    expect(syncNativeVersions(root, '1.0.25')).toBe(false);
  });
});
