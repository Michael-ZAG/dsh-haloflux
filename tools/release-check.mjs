#!/usr/bin/env node
/**
 * release-check.cjs — 上传 GitHub 之前的发布前检查。
 *
 *   node tools/release-check.cjs
 *
 * 检查项：
 *   1. package.json 可解析，关键字段齐全（name / version / license / dsh.bundle）
 *   2. cordis.patch.yml 存在且引用的包名正确
 *   3. 预构建产物 client.js 存在且足够大（市场从 GitHub 安装时不会本地构建）
 *   4. LICENSE / NOTICE 齐全且保留 Required Notice
 *   5. 全仓不泄漏本机路径、密钥、绝对盘符
 *   6. 没有不该进仓库的二进制/截图/临时文件
 *   7. OWNER 占位符是否已替换
 *
 * 退出码：0 全部通过；1 有硬错误；2 只有警告。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.txt', '.svg', '']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push({ full, rel: full.slice(root.length + 1).replace(/\\/g, '/'), size: st.size });
  }
  return out;
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// 1. package.json
let pkg;
try {
  pkg = JSON.parse(read('package.json'));
} catch (e) {
  errors.push(`package.json 无法解析: ${e.message}`);
}

if (pkg) {
  if (pkg.name !== 'dsh-haloflux') errors.push(`name 应为 dsh-haloflux，实际 ${pkg.name}`);
  if (!/^\d+\.\d+\.\d+/.test(pkg.version || '')) errors.push(`version 不合规: ${pkg.version}`);
  if (!pkg.license) errors.push('缺少 license 字段');
  else if (!/PolyForm-Noncommercial-1\.0\.0/.test(pkg.license)) warnings.push(`license 建议写 SPDX id PolyForm-Noncommercial-1.0.0，实际 ${pkg.license}`);
  if (!pkg.dsh?.bundle?.patch) errors.push('缺少 dsh.bundle.patch —— 市场会直接拒绝（最常见拒因）');
  if (pkg.scripts?.prepare) errors.push('存在 scripts.prepare —— pnpm 装 git 依赖时会执行它，会失败');
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) warnings.push(`存在 dependencies（${Object.keys(pkg.dependencies).join(', ')}），GitHub 安装时不会自动装`);
}

// 2. patch 文件
if (pkg?.dsh?.bundle?.patch) {
  const patchRel = String(pkg.dsh.bundle.patch).replace(/^\.\//, '');
  if (!existsSync(join(root, patchRel))) errors.push(`dsh.bundle.patch 指向的文件不存在: ${patchRel}`);
  else {
    const patch = read(patchRel);
    if (!/dsh-haloflux/.test(patch)) errors.push(`${patchRel} 里没有出现 dsh-haloflux`);
  }
}

// 3. 预构建产物
const client = join(root, 'client.js');
if (!existsSync(client)) errors.push('缺少 client.js —— 仓库必须带预构建产物');
else {
  const size = statSync(client).size;
  if (size < 100 * 1024) errors.push(`client.js 只有 ${size} B，可能是没构建的占位`);
  else console.log(`client.js: ${(size / 1024).toFixed(0)} KB`);
}
if (!existsSync(join(root, 'index.js'))) errors.push('缺少 index.js');

// 4. 许可文件
const license = existsSync(join(root, 'LICENSE')) ? read('LICENSE') : '';
if (!license) errors.push('缺少 LICENSE');
else {
  if (!/PolyForm Noncommercial/i.test(license)) errors.push('LICENSE 不是 PolyForm Noncommercial');
  if (!/Required Notice/.test(license)) errors.push('LICENSE 缺少 Required Notice 行');
}
const notice = existsSync(join(root, 'NOTICE')) ? read('NOTICE') : '';
if (!notice) errors.push('缺少 NOTICE');
else {
  if (!/Ryder191/.test(notice)) errors.push('NOTICE 未保留原作者署名');
  if (!/Noncommercial use only/i.test(notice)) errors.push('NOTICE 缺少非商业使用声明');
}

// 5/6. 全仓扫描
const files = walk(root);
const FORBIDDEN = [
  [/[A-Za-z]:\\{1,2}(DSH|Users|Program)/, '本机绝对路径'],
  [/\bD:\\/i, '本机盘符路径'],
  [/C:\\Users\\/i, '本机用户目录'],
  [/sk-[A-Za-z0-9]{16,}/, '疑似 API Key'],
  [/ghp_[A-Za-z0-9]{20,}/, '疑似 GitHub Token'],
  [/(token|api[_-]?key)\s*=\s*['"][A-Za-z0-9_-]{16,}/i, '疑似硬编码凭据'],
  [/127\.0\.0\.1:\d{4,5}/, '本机端口（文档里别写死）'],
];
const ALLOWED_BINARY = /\.(svg)$/i;
const SELF = 'tools/release-check.mjs';

for (const f of files) {
  if (f.rel === SELF) continue; // 检查器自身含检测用的正则字面量，跳过
  const ext = extname(f.rel).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    if (!ALLOWED_BINARY.test(f.rel)) warnings.push(`仓库里有非文本文件: ${f.rel}（${f.size} B）`);
    continue;
  }
  let body;
  try {
    body = read(f.rel);
  } catch {
    continue;
  }
  for (const [re, label] of FORBIDDEN) {
    if (re.test(body)) errors.push(`${f.rel}: 命中${label}`);
  }
  if (f.size > 2 * 1024 * 1024) warnings.push(`文件偏大: ${f.rel}（${(f.size / 1048576).toFixed(1)} MB）`);
}

for (const f of files) {
  if (/\.(png|jpe?g|webp|gif|mp4|log|zip|7z)$/i.test(f.rel)) warnings.push(`不应提交的文件: ${f.rel}`);
}

// 7. 占位符
const pending = files.filter(
  (f) => !f.rel.startsWith('tools/') && TEXT_EXT.has(extname(f.rel).toLowerCase()) && /\bOWNER\b/.test(read(f.rel)),
);
if (pending.length) warnings.push(`还有 OWNER 占位符未替换: ${pending.map((f) => f.rel).join(', ')}`);

// 输出
console.log(`\n检查文件: ${files.length} 个，合计 ${(files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB\n`);
if (warnings.length) {
  console.log('警告:');
  for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.log('\n错误:');
  for (const e of errors) console.log('  x ' + e);
  console.log('\n结论: 未通过');
  process.exit(1);
}
console.log('\n结论: 通过' + (warnings.length ? '（有警告，确认后再上传）' : ''));
process.exit(warnings.length ? 2 : 0);
