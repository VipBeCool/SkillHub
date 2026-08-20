#!/usr/bin/env node

/**
 * 版本号同步脚本
 * 用法: node scripts/bump-version.mjs <version>
 * 示例: node scripts/bump-version.mjs 0.2.0
 *
 * 同时修改以下三处的版本号:
 * - package.json
 * - src-tauri/tauri.conf.json
 * - src-tauri/Cargo.toml
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('用法: node scripts/bump-version.mjs <version>');
  console.error('示例: node scripts/bump-version.mjs 0.2.0');
  process.exit(1);
}

// 校验版本号格式
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`版本号格式不正确: "${newVersion}"，应为 x.y.z 格式（如 0.2.0、1.0.0）`);
  process.exit(1);
}

const files = [
  {
    path: resolve(root, 'package.json'),
    name: 'package.json',
    update(content) {
      const json = JSON.parse(content);
      const old = json.version;
      json.version = newVersion;
      return { result: JSON.stringify(json, null, 2) + '\n', old };
    }
  },
  {
    path: resolve(root, 'src-tauri/tauri.conf.json'),
    name: 'src-tauri/tauri.conf.json',
    update(content) {
      const json = JSON.parse(content);
      const old = json.version;
      json.version = newVersion;
      return { result: JSON.stringify(json, null, 2) + '\n', old };
    }
  },
  {
    path: resolve(root, 'src-tauri/Cargo.toml'),
    name: 'src-tauri/Cargo.toml',
    update(content) {
      // 只替换 [package] 下的 version，不影响依赖项的 version
      const lines = content.split('\n');
      let inPackage = false;
      let old = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '[package]') {
          inPackage = true;
          continue;
        }
        if (lines[i].startsWith('[') && inPackage) break;
        if (inPackage && lines[i].startsWith('version')) {
          const match = lines[i].match(/version\s*=\s*"([^"]+)"/);
          if (match) {
            old = match[1];
            lines[i] = `version = "${newVersion}"`;
            break;
          }
        }
      }
      return { result: lines.join('\n'), old };
    }
  }
];

console.log(`\n🔄 正在同步版本号为 ${newVersion}\n`);

for (const file of files) {
  try {
    const content = readFileSync(file.path, 'utf-8');
    const { result, old } = file.update(content);
    writeFileSync(file.path, result);
    console.log(`  ✅ ${file.name}: ${old} → ${newVersion}`);
  } catch (err) {
    console.error(`  ❌ ${file.name}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`\n✨ 完成！接下来执行:`);
console.log(`  git add -A`);
console.log(`  git commit -m "release: v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push && git push --tags\n`);
