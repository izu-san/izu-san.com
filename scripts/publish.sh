#!/usr/bin/env bash
# S3 への配置・キャッシュ無効化・公開後の確認・成果物の保管・自動復旧・旧アセットの削除（仕様書 §9.2・§9.3）。
# 公開ワークフロー（publish.yml）とロールバック（rollback.yml）が共有する。AWS の認証情報は呼び出し側で用意する。
#
# 使い方:
#   publish.sh release  <dist> <コミット ID>   配置 → 無効化 → 確認 → 保管 → 旧アセット削除。失敗したら直前の成功版を再公開する
#   publish.sh rollback <コミット ID>          保管済みの成果物を再公開する（再ビルドしない）
#
# 環境変数（必須）:
#   SITE_ENV            production または preview
#   SITE_BUCKET         公開先の S3 バケット
#   RELEASES_BUCKET     成果物の保管先の S3 バケット
#   DISTRIBUTION_ID     CloudFront ディストリビューション ID
#   CHECK_HOST          公開後の確認に使うホスト（*.cloudfront.net）。本番の Alias は ZJS-14 まで無いため、独自ドメインに頼らない
# 環境変数（任意）:
#   PREVIEW_BASIC_AUTH  「user:pass」。あれば、プレビューの認証後の表示も確認する（ログには出さない）
#   SIMULATE_FAILURE    true なら、配置の後に失敗させる（自動復旧の確認用）
set -euo pipefail

: "${SITE_ENV:?}" "${SITE_BUCKET:?}" "${RELEASES_BUCKET:?}" "${DISTRIBUTION_ID:?}" "${CHECK_HOST:?}"
case "$SITE_ENV" in production | preview) ;; *) echo "SITE_ENV が不正: $SITE_ENV" >&2; exit 2 ;; esac

# 保管先は環境ごとの接頭辞に分ける（公開ロールの権限と一致させる）。
RELEASES_PREFIX="releases/${SITE_ENV}"
LATEST_KEY="${RELEASES_PREFIX}/LATEST"
RETENTION_DAYS=30

HTML_CACHE="max-age=0, must-revalidate"
ASSET_CACHE="public, max-age=31536000, immutable"
PUBLIC_CACHE="public, max-age=3600"

log() { echo "[$SITE_ENV] $*"; }
warn() { echo "::warning::[$SITE_ENV] $*"; }
fail() { echo "::error::[$SITE_ENV] $*"; exit 1; }

# 新しい画像・CSS 等を先に置き、最後に HTML を置く。キャッシュ中の旧 HTML が新しい HTML より先に壊れないようにする。
upload() {
  local dist="$1"
  log "ハッシュ付きアセット（_astro/）を配置する"
  if [ -d "$dist/_astro" ]; then
    aws s3 cp "$dist/_astro" "s3://${SITE_BUCKET}/_astro" --recursive --only-show-errors \
      --cache-control "$ASSET_CACHE"
  fi
  log "public/ 配下などの HTML 以外を配置する"
  aws s3 cp "$dist" "s3://${SITE_BUCKET}/" --recursive --only-show-errors \
    --exclude "*.html" --exclude "_astro/*" --cache-control "$PUBLIC_CACHE"
  log "HTML を配置する"
  aws s3 cp "$dist" "s3://${SITE_BUCKET}/" --recursive --only-show-errors \
    --exclude "*" --include "*.html" --cache-control "$HTML_CACHE"
}

# HTML と public/ 配下だけを無効化する。_astro/ はハッシュ付きなので無効化しない。
invalidate() {
  local dist="$1" file path
  local -a paths=()
  while IFS= read -r file; do
    case "$file" in
      _astro/*) ;;
      index.html) paths+=("/" "/index.html") ;;
      */index.html) paths+=("/${file%index.html}" "/${file}") ;;
      *) paths+=("/${file}") ;;
    esac
  done < <(cd "$dist" && find . -type f | sed 's|^\./||' | sort)
  [ "${#paths[@]}" -gt 0 ] || fail "無効化するパスがない"
  log "キャッシュを無効化する（${#paths[@]} パス）"
  local id
  id=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" \
    --paths "${paths[@]}" --query 'Invalidation.Id' --output text)
  aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$id"
}

# curl の結果を「ステータス」で返す。認証付きのときは資格情報を引数に載せず、設定を標準入力で渡す。
http_status() {
  local url="$1"; shift
  if [ -n "${PREVIEW_BASIC_AUTH:-}" ] && [ "${AUTHED:-}" = "1" ]; then
    printf 'user = "%s"\n' "$PREVIEW_BASIC_AUTH" | curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -K - "$@" "$url"
  else
    curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" "$url"
  fi
}
http_get() {
  local url="$1"; shift
  if [ -n "${PREVIEW_BASIC_AUTH:-}" ] && [ "${AUTHED:-}" = "1" ]; then
    printf 'user = "%s"\n' "$PREVIEW_BASIC_AUTH" | curl -sS --max-time 20 -K - "$@" "$url"
  else
    curl -sS --max-time 20 "$@" "$url"
  fi
}

# 期待するステータスになるまで数回試す（無効化の直後に古い応答が残ることがある）。
expect_status() {
  local expected="$1" url="$2" label="$3"; shift 3
  local got="" i
  for i in 1 2 3 4 5; do
    got=$(http_status "$url" "$@" || true)
    [ "$got" = "$expected" ] && { log "確認 OK: $label → $got"; return 0; }
    sleep 5
  done
  fail "$label: $expected を期待したが $got だった（$url）"
}

# 公開後の確認。HTTPS、日英ページ、404。S3 の 403 と権限不備を切り分ける。
check() {
  local dist="$1" base="https://${CHECK_HOST}"
  log "公開後の確認（${base}）"

  expect_status 301 "http://${CHECK_HOST}/" "HTTP は HTTPS へ転送"

  if [ "$SITE_ENV" = "preview" ]; then
    # 認証なしでは取得できない。認証の確認はプレビューだけ。
    expect_status 401 "${base}/" "認証なしの日本語版は 401"
    expect_status 401 "${base}/en/" "認証なしの英語版は 401"
    expect_status 401 "${base}/_astro/" "認証なしのアセットは 401"
    if [ -z "${PREVIEW_BASIC_AUTH:-}" ]; then
      warn "PREVIEW_BASIC_AUTH が未設定のため、認証後の日英ページと 404 は確認していない"
      return 0
    fi
    AUTHED=1
  fi

  expect_status 200 "${base}/" "日本語版"
  expect_status 200 "${base}/en/" "英語版"
  # 本文は変数に取ってから調べる（grep -q が早く終わると、curl が失敗して pipefail で誤判定する）。
  local body
  body=$(http_get "${base}/")
  grep -q '<html lang="ja"' <<<"$body" || fail "日本語版の内容が違う"
  body=$(http_get "${base}/en/")
  grep -q '<html lang="en"' <<<"$body" || fail "英語版の内容が違う"

  # 存在しないパスは 404。S3 の 403 が 404 に変換されていなければ、エラー応答の設定を疑う。
  # 存在するページが 200 なので、権限不備（読めない）とは切り分けられている。
  local missing
  for missing in "/__publish-check-missing__" "/en/__publish-check-missing__"; do
    local got
    got=$(http_status "${base}${missing}" || true)
    if [ "$got" = "403" ]; then
      fail "${missing}: 403 が 404 に変換されていない（存在するページは 200 なので、権限ではなくエラー応答の設定を確認する）"
    fi
    expect_status 404 "${base}${missing}" "存在しないパス ${missing}"
  done
  body=$(http_get "${base}/__publish-check-missing__")
  grep -q '<html' <<<"$body" || fail "404 の本文がカスタム 404 ページでない"

  # ハッシュ付きアセットに長期キャッシュが付いている。
  local asset
  asset=$(cd "$dist" && find _astro -type f -name '*.css' | head -n 1)
  if [ -n "$asset" ]; then
    local headers
    headers=$(http_get "${base}/${asset}" -D - -o /dev/null | tr -d '\r')
    echo "$headers" | grep -qi '^cache-control:.*immutable' || fail "/${asset} に長期キャッシュの Cache-Control がない"
    echo "$headers" | grep -qi '^cache-control:.*max-age=31536000' || fail "/${asset} の max-age が 31536000 でない"
    log "確認 OK: /${asset} に長期キャッシュ"
  fi
}

# 直前の成功版のコミット ID。無ければ空。
read_latest() {
  aws s3 cp "s3://${RELEASES_BUCKET}/${LATEST_KEY}" - 2>/dev/null | tr -d '[:space:]' || true
}

fetch_release() {
  local commit="$1" dir="$2"
  mkdir -p "$dir"
  aws s3 cp "s3://${RELEASES_BUCKET}/${RELEASES_PREFIX}/${commit}/" "$dir" --recursive --only-show-errors
  [ -f "$dir/index.html" ] || fail "保管済みの成果物がない: ${RELEASES_PREFIX}/${commit}/"
}

archive() {
  local dist="$1" commit="$2"
  log "成果物を保管する（${RELEASES_PREFIX}/${commit}/）"
  aws s3 cp "$dist" "s3://${RELEASES_BUCKET}/${RELEASES_PREFIX}/${commit}/" --recursive --only-show-errors
  printf '%s\n' "$commit" | aws s3 cp - "s3://${RELEASES_BUCKET}/${LATEST_KEY}" --only-show-errors
}

# 今回のビルドに含まれず、最終更新から 30 日を超えたオブジェクトだけを削除する。
prune() {
  local dist="$1" cutoff tmp
  cutoff=$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%S)
  tmp=$(mktemp -d)
  (cd "$dist" && find . -type f | sed 's|^\./||' | sort) >"$tmp/current"
  [ -s "$tmp/current" ] || { warn "今回のビルドが空のため、旧アセットを削除しない"; return 0; }
  aws s3api list-objects-v2 --bucket "$SITE_BUCKET" --output json \
    | jq -r --arg cutoff "$cutoff" '.Contents[]? | select(.LastModified < $cutoff) | .Key' | sort >"$tmp/old"
  comm -23 "$tmp/old" "$tmp/current" >"$tmp/delete"
  log "旧アセットの削除対象: $(wc -l <"$tmp/delete") 件（${cutoff} より前）"
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    aws s3 rm "s3://${SITE_BUCKET}/${key}" --only-show-errors
  done <"$tmp/delete"
  rm -rf "$tmp"
}

# release の本体。別プロセスで動かし、途中で失敗したら set -e で止まるようにする。
release_steps() {
  local dist="$1"
  upload "$dist"
  if [ "${SIMULATE_FAILURE:-}" = "true" ]; then
    fail "意図的な失敗（SIMULATE_FAILURE=true）。配置の後に止める"
  fi
  invalidate "$dist"
  check "$dist"
}

# 保管済みの成果物を、通常の公開と同じ手順（アセット → HTML → 無効化 → 確認）で公開する。
restore_steps() {
  local commit="$1" dir
  dir=$(mktemp -d)
  fetch_release "$commit" "$dir"
  upload "$dir"
  invalidate "$dir"
  check "$dir"
}

cmd_release() {
  local dist="$1" commit="$2" previous
  previous=$(read_latest)
  log "公開する: ${commit}（直前の成功版: ${previous:-なし}）"

  if ! bash "$0" release-steps "$dist"; then
    echo "::error::[$SITE_ENV] 公開に失敗した"
    if [ -n "$previous" ] && [ "$previous" != "$commit" ]; then
      log "直前の成功版 ${previous} を再公開する"
      if bash "$0" restore-steps "$previous"; then
        echo "result=rolled-back:${previous}" >>"${GITHUB_OUTPUT:-/dev/null}"
        echo "::error::[$SITE_ENV] 公開は失敗し、${previous} に戻した"
      else
        echo "result=rollback-failed" >>"${GITHUB_OUTPUT:-/dev/null}"
        echo "::error::[$SITE_ENV] 自動復旧にも失敗した。手動ロールバックが必要"
      fi
    else
      echo "result=failed-no-previous" >>"${GITHUB_OUTPUT:-/dev/null}"
      echo "::error::[$SITE_ENV] 復旧できる直前の成功版がない"
    fi
    return 1
  fi

  archive "$dist" "$commit"
  echo "result=published" >>"${GITHUB_OUTPUT:-/dev/null}"
  # 削除の失敗は公開の成否に関わらせない。
  prune "$dist" || warn "旧アセットの削除に失敗した（公開は成功）"
}

cmd_rollback() {
  local commit="$1"
  log "ロールバックする: ${commit}（再ビルドしない）"
  restore_steps "$commit"
  printf '%s\n' "$commit" | aws s3 cp - "s3://${RELEASES_BUCKET}/${LATEST_KEY}" --only-show-errors
  echo "result=rolled-back:${commit}" >>"${GITHUB_OUTPUT:-/dev/null}"
}

case "${1:-}" in
  release) cmd_release "${2:?dist}" "${3:?commit}" ;;
  release-steps) release_steps "${2:?dist}" ;;
  restore-steps) restore_steps "${2:?commit}" ;;
  rollback) cmd_rollback "${2:?commit}" ;;
  *) sed -n '2,19p' "$0" >&2; exit 2 ;;
esac
