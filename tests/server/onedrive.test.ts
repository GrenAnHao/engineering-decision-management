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

test('前缀相同的兄弟目录（OneDrive2）不算在 OneDrive 内', async () => {
  const { oneDrive } = setup();
  const sibling = join(oneDrive + '2', 'edm');
  mkdirSync(join(sibling, 'node_modules'), { recursive: true });
  expect(await checkNodeModulesSync(sibling, { OneDrive: oneDrive })).toBeNull();
});

test('OneDriveConsumer / OneDriveCommercial 同样生效，应用目录等于根目录也算在内', async () => {
  const { oneDrive, app } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDriveConsumer: oneDrive })).not.toBeNull();
  expect(await checkNodeModulesSync(app, { OneDriveCommercial: oneDrive })).not.toBeNull();
  mkdirSync(join(oneDrive, 'node_modules'));
  expect(await checkNodeModulesSync(oneDrive, { OneDrive: oneDrive })).not.toBeNull();
});

test.if(process.platform === 'win32')('Windows 下路径比较不区分大小写', async () => {
  const { oneDrive, app } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDrive: oneDrive.toUpperCase() })).not.toBeNull();
});
