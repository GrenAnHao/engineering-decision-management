import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkNodeModulesSync } from '../../src/server/onedrive';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function setup(): { oneDrive: string; app: string; outside: string } {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  const oneDrive = join(tmp.dir, 'OneDrive');
  const app = join(oneDrive, 'Projects', 'edm');
  const outside = join(tmp.dir, 'outside-node_modules');
  mkdirSync(app, { recursive: true });
  mkdirSync(outside);
  return { oneDrive, app, outside };
}

test('应用在 OneDrive 内且 node_modules 是实体目录时给出提示', async () => {
  const { oneDrive, app } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDrive: oneDrive })).toContain('README「OneDrive 注意事项」');
});

test('node_modules 是 junction 时不提示', async () => {
  const { oneDrive, app, outside } = setup();
  symlinkSync(outside, join(app, 'node_modules'), 'junction');
  expect(await checkNodeModulesSync(app, { OneDrive: oneDrive })).toBeNull();
});

test('应用不在 OneDrive 内或尚未安装依赖时不提示', async () => {
  const { app, outside } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDrive: outside })).toBeNull();
  expect(await checkNodeModulesSync(app, {})).toBeNull();
  const fresh = setup();
  expect(await checkNodeModulesSync(fresh.app, { OneDrive: fresh.oneDrive })).toBeNull();
});
