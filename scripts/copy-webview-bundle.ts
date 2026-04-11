import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

const srcDir = resolve(__dirname, '..', 'dist', 'mobile-renderer');
const dstDir = resolve(__dirname, '..', 'mobile', 'assets', 'webview');

if (!existsSync(srcDir)) {
  console.error(`Source not found: ${srcDir}. Run "npm run build:mobile-renderer" first.`);
  process.exit(1);
}

if (existsSync(dstDir)) rmSync(dstDir, { recursive: true, force: true });
mkdirSync(dstDir, { recursive: true });
cpSync(srcDir, dstDir, { recursive: true });
console.log(`Copied ${srcDir} → ${dstDir}`);
