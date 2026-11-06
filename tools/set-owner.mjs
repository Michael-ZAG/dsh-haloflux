#!/usr/bin/env node
/**
 * set-owner.cjs — 把仓库里的 OWNER 占位符替换成真实 GitHub 用户名。
 *
 *   node tools/set-owner.cjs <github-username>
 *
 * 只改四个文本文件里的 OWNER 记号，不碰源码。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const owner = (process.argv[2] || '').trim().replace(/^@/, '');

if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  console.error('用法: node tools/set-owner.cjs <github-username>');
  console.error('用户名只允许字母、数字、中划线，1–39 个字符。');
  process.exit(1);
}

const targets = ['package.json', 'README.md', 'README.en.md', join('docs', 'market-entry.yml')];
let changed = 0;

for (const rel of targets) {
  const file = join(root, rel);
  if (!existsSync(file)) {
    console.warn(`跳过（不存在）: ${rel}`);
    continue;
  }
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/\bOWNER\b/g, owner);
  if (after === before) {
    console.log(`无变化: ${rel}`);
    continue;
  }
  writeFileSync(file, after, 'utf8');
  const n = (before.match(/\bOWNER\b/g) || []).length;
  console.log(`已更新: ${rel}（${n} 处）`);
  changed += n;
}

console.log(changed ? `\n完成：${changed} 处占位符已替换为 ${owner}。` : '\n没有需要替换的占位符。');
