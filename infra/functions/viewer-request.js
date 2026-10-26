// CloudFront Functions（cloudfront-js-2.0）の viewer-request。本番とプレビューで共通。
// AUTH_REQUIRED と AUTH_SHA256 は、デプロイ時に infra/lib/viewer-request.ts が先頭へ差し込む。
//  - AUTH_REQUIRED が true のとき（プレビュー）、すべてのリクエストに Basic 認証を求める。
//    認証はキャッシュ参照より前に行う。AUTH_SHA256 が不正・空なら、全リクエストを拒否する。
//  - 認証の後で、URL の書き換え（/ → /index.html）と 301 転送を行う。
// ログは出力しない（資格情報の漏えい経路になるため）。

var crypto = require('crypto');

var MAX_AUTH_LENGTH = 512;

function equalHex(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(request) {
  if (!/^[0-9a-f]{64}$/.test(AUTH_SHA256)) return false;
  var header = request.headers.authorization;
  if (!header || typeof header.value !== 'string' || header.value.length > MAX_AUTH_LENGTH) return false;
  var match = /^Basic +([A-Za-z0-9+\/=_-]+)$/i.exec(header.value);
  if (!match) return false;
  var credentials = Buffer.from(match[1], 'base64').toString();
  var digest = crypto.createHash('sha256').update(credentials).digest('hex');
  return equalHex(digest, AUTH_SHA256);
}

function unauthorized() {
  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="preview", charset="UTF-8"' },
      'cache-control': { value: 'no-store' },
      'x-robots-tag': { value: 'noindex, nofollow' },
    },
  };
}

function queryString(request) {
  var parts = [];
  var query = request.querystring || {};
  for (var key in query) {
    var entry = query[key];
    var values = entry.multiValue ? entry.multiValue.map(function (v) { return v.value; }) : [entry.value];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i] === '' ? key : key + '=' + values[i]);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function redirect(request, location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: location + queryString(request) } },
  };
}

function handler(event) {
  var request = event.request;
  if (AUTH_REQUIRED && !isAuthorized(request)) return unauthorized();

  var uri = request.uri;
  if (uri === '/en') return redirect(request, '/en/');
  if (uri === '/index.html') return redirect(request, '/');
  if (uri === '/en/index.html') return redirect(request, '/en/');
  if (uri === '/') request.uri = '/index.html';
  else if (uri === '/en/') request.uri = '/en/index.html';
  return request;
}
