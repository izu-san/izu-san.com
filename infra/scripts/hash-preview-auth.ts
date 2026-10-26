// プレビュー認証のハッシュを作る。標準入力から「user:pass」を 1 行で受け取り、SHA-256 の 16 進だけを出力する。
// 資格情報を引数や環境変数に載せないため、標準入力を使う。
//   printf '%s' 'user:pass' | node infra/scripts/hash-preview-auth.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const credentials = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (!/^[^:]+:.+$/.test(credentials)) {
  console.error('「user:pass」の形式で標準入力に渡してください');
  process.exit(1);
}
console.log(createHash('sha256').update(credentials).digest('hex'));
