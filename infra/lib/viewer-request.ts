import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../functions/viewer-request.js', import.meta.url), 'utf8');

const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface ViewerRequestOptions {
  /** true のとき（プレビュー）、すべてのリクエストに Basic 認証を求める。 */
  readonly authRequired: boolean;
  /** 「user:pass」の SHA-256（小文字の 16 進 64 桁）。空なら、認証が必要な環境は全リクエストを拒否する。 */
  readonly authSha256?: string;
}

/** Function のコードを組み立てる。不正なハッシュは、静かに通さず例外にする。 */
export function viewerRequestCode({ authRequired, authSha256 = '' }: ViewerRequestOptions): string {
  if (authSha256 !== '' && !SHA256_HEX.test(authSha256)) {
    throw new Error('authSha256 は小文字の 16 進 64 桁（SHA-256）で指定してください');
  }
  if (!authRequired && authSha256 !== '') {
    throw new Error('認証が不要な環境にハッシュは渡せません');
  }
  return `var AUTH_REQUIRED = ${authRequired};\nvar AUTH_SHA256 = ${JSON.stringify(authSha256)};\n${SOURCE}`;
}
