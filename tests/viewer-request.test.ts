import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import { viewerRequestCode } from '../infra/lib/viewer-request.ts';

// テスト用の資格情報（本物ではない）。
const CREDENTIALS = 'tester:correct-horse-battery-staple-0123456789';
const HASH = createHash('sha256').update(CREDENTIALS).digest('hex');
const basic = (c: string) => `Basic ${Buffer.from(c).toString('base64')}`;

type Req = {
  uri: string;
  method?: string;
  headers: Record<string, { value: string }>;
  querystring?: Record<string, { value: string; multiValue?: { value: string }[] }>;
};
type Res = { statusCode?: number; headers?: Record<string, { value: string }>; uri?: string };

function load(options: { authRequired: boolean; authSha256?: string }) {
  const sandbox = { require: (m: string) => (m === 'crypto' ? { createHash } : assert.fail(m)), Buffer, handler: undefined as unknown };
  vm.createContext(sandbox);
  vm.runInContext(`${viewerRequestCode(options)}\nthis.handler = handler;`, sandbox);
  return (req: Req, auth?: string): Res => {
    const request = { method: 'GET', querystring: {}, ...req, headers: { ...req.headers } };
    if (auth !== undefined) request.headers.authorization = { value: auth };
    return (sandbox.handler as (e: unknown) => Res)({ request });
  };
}

const preview = load({ authRequired: true, authSha256: HASH });
const production = load({ authRequired: false });
const get = (uri: string, extra: Partial<Req> = {}): Req => ({ uri, headers: {}, ...extra });

test('プレビュー: 認証なしは 401 で、再入力を促し、キャッシュさせない', () => {
  const res = preview(get('/'));
  assert.equal(res.statusCode, 401);
  assert.match(res.headers!['www-authenticate'].value, /^Basic /);
  assert.equal(res.headers!['cache-control'].value, 'no-store');
  assert.equal(res.headers!['x-robots-tag'].value, 'noindex, nofollow');
});

test('プレビュー: 正しい資格情報なら通り、HTML 以外にも認証を求める', () => {
  assert.equal(preview(get('/'), basic(CREDENTIALS)).uri, '/index.html');
  for (const uri of ['/_astro/a.abc123.css', '/img/a.png', '/404.html', '/xxx', '/robots.txt']) {
    assert.equal(preview(get(uri)).statusCode, 401, uri);
    assert.equal(preview(get(uri), basic(CREDENTIALS)).uri, uri);
  }
});

test('プレビュー: 誤った資格情報・形式違いは 401', () => {
  const bad = [
    basic('tester:wrong'),
    basic('other:correct-horse-battery-staple-0123456789'),
    basic(`${CREDENTIALS} `),
    `Bearer ${Buffer.from(CREDENTIALS).toString('base64')}`,
    'Basic',
    'Basic !!!',
    `Basic ${'A'.repeat(600)}`,
    '',
  ];
  for (const auth of bad) assert.equal(preview(get('/'), auth).statusCode, 401, auth.slice(0, 20));
});

test('プレビュー: 認証の前に転送や書き換えを行わない（未認証は転送先も分からない）', () => {
  for (const uri of ['/en', '/index.html', '/en/index.html']) {
    assert.equal(preview(get(uri)).statusCode, 401, uri);
  }
});

test('プレビュー: ハッシュが空なら、正しそうな資格情報でも全拒否（認証なしで公開しない）', () => {
  const closed = load({ authRequired: true });
  assert.equal(closed(get('/'), basic(CREDENTIALS)).statusCode, 401);
  assert.equal(closed(get('/')).statusCode, 401);
});

test('本番: 認証を求めず、Authorization ヘッダーも見ない', () => {
  assert.equal(production(get('/')).uri, '/index.html');
  assert.equal(production(get('/'), basic('x:y')).uri, '/index.html');
});

for (const [name, run] of [['本番', (r: Req) => production(r)], ['プレビュー', (r: Req) => preview(r, basic(CREDENTIALS))]] as const) {
  test(`${name}: / と /en/ を index.html へ書き換える`, () => {
    assert.equal(run(get('/')).uri, '/index.html');
    assert.equal(run(get('/en/')).uri, '/en/index.html');
  });

  test(`${name}: /en、/index.html、/en/index.html を 301 で転送する`, () => {
    for (const [from, to] of [['/en', '/en/'], ['/index.html', '/'], ['/en/index.html', '/en/']]) {
      const res = run(get(from));
      assert.equal(res.statusCode, 301, from);
      assert.equal(res.headers!.location.value, to);
    }
  });

  test(`${name}: 作品の個別ページを index.html へ書き換え、/ なしと index.html 付きは 301 で転送する`, () => {
    assert.equal(run(get('/works/maidai/')).uri, '/works/maidai/index.html');
    assert.equal(run(get('/en/works/home-server/')).uri, '/en/works/home-server/index.html');
    for (const [from, to] of [
      ['/works/maidai', '/works/maidai/'],
      ['/works/maidai/index.html', '/works/maidai/'],
      ['/en/works/home-server', '/en/works/home-server/'],
      ['/en/works/home-server/index.html', '/en/works/home-server/'],
    ]) {
      const res = run(get(from));
      assert.equal(res.statusCode, 301, from);
      assert.equal(res.headers!.location.value, to);
    }
    // 作品 ID の形式でないものは書き換えない
    for (const uri of ['/works/', '/works/A_b/', '/works/a/b/', '/en/works/']) assert.equal(run(get(uri)).uri, uri);
  });

  test(`${name}: 転送でクエリ文字列を保つ`, () => {
    const res = run(get('/en', { querystring: { a: { value: '1' }, b: { value: '', multiValue: [{ value: 'x' }, { value: 'y' }] } } }));
    assert.equal(res.headers!.location.value, '/en/?a=1&b=x&b=y');
  });

  test(`${name}: その他のパスはそのまま通す（存在しなければ S3 の 403/404 → 404 ページ）`, () => {
    for (const uri of ['/xxx', '/en/xxx', '/_astro/a.abc.css', '/404.html', '/en/other']) {
      assert.equal(run(get(uri)).uri, uri);
    }
  });
}

test('Function のコード: 不正なハッシュは例外、ログは出さず、容量制限(10KB)に収まる', () => {
  assert.throws(() => viewerRequestCode({ authRequired: true, authSha256: 'abc' }));
  assert.throws(() => viewerRequestCode({ authRequired: true, authSha256: HASH.toUpperCase() }));
  assert.throws(() => viewerRequestCode({ authRequired: false, authSha256: HASH }));
  const code = viewerRequestCode({ authRequired: true, authSha256: HASH });
  assert.ok(!/console\./.test(code));
  assert.ok(Buffer.byteLength(code) < 10 * 1024);
});
