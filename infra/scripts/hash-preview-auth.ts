// プレビュー認証のハッシュを作る。標準入力から「user:pass」を 1 行で受け取り、SHA-256 の 16 進だけを出力する。
// 資格情報を引数や環境変数に載せないため、標準入力を使う。
//   printf '%s' 'user:pass' | node infra/scripts/hash-preview-auth.ts
// ソルトなしの高速なハッシュなので、ハッシュが漏れても総当たりで復元されないよう、パスワードは 32 文字以上を必須にする。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const MIN_PASSWORD_LENGTH = 32;

const credentials = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
const separator = credentials.indexOf(':');
if (separator < 1) {
  console.error('「user:pass」の形式で標準入力に渡してください');
  process.exit(1);
}
if (credentials.length - separator - 1 < MIN_PASSWORD_LENGTH) {
  console.error(`パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください（例: openssl rand -base64 36）`);
  process.exit(1);
}
console.log(createHash('sha256').update(credentials).digest('hex'));
