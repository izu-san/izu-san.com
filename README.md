# izu-san.com

いづさん（Izu-san）のポートフォリオサイトです。プロフィール、技術への関心（AI 駆動開発、ローカル LLM、工場自動化ゲーム）、個人開発を紹介します。日本語と英語を同じ内容で公開します。

Personal portfolio site of Izu-san: profile, interests (AI-driven development, local LLMs, factory-automation games) and personal projects, published in Japanese and English with identical content.

- 本番 / Production: https://izu-san.com
- プレビュー / Preview: <https://preview.izu-san.com> （Basic 認証あり / Basic auth required）

## 技術構成 / Stack

仕様書（YouTrack `ZJS-A-1`）に基づく予定の構成です。導入済みのものは順次追記します。

| 用途 | 技術 |
| --- | --- |
| 静的サイト生成 | Astro、TypeScript、通常の CSS |
| コンテンツ | Markdown と Astro Content Collections（zod で検証） |
| パッケージ管理 | pnpm |
| インフラ | AWS CDK v2（TypeScript）、S3、CloudFront、ACM、Route 53 |
| CI/CD | GitHub Actions（OIDC で AWS に一時認証） |
| 解析 | Cloudflare Web Analytics |

## 開発の始め方 / Getting started

Node.js 24.22.1（`.nvmrc`）と pnpm 12.15.0（`package.json` の `packageManager`）を使います。

```bash
pnpm install --frozen-lockfile  # 依存関係の取得 / install dependencies
pnpm dev                        # 開発サーバー / dev server
pnpm check                      # 型チェック / type check
pnpm build                      # 静的ファイルを dist/ に生成 / build to dist/
pnpm preview                    # ビルド結果の確認 / preview the build
```

Requires Node.js 24.22.1 (`.nvmrc`) and pnpm 12.15.0 (`packageManager` in `package.json`).

## ブランチ運用 / Branches

- `main`: 本番公開用。push で本番に公開されます。
- `preview`: 共有プレビュー用。push でプレビューに公開されます。
- 作業ブランチ → `preview`（マージコミット）→ 表示確認 → `preview` から `main` へ Pull Request（マージコミット）の順に進めます。

## ライセンス / License

コードとコンテンツで権利が異なります。

| 対象 | 権利 |
| --- | --- |
| ソースコード（下記コンテンツ以外のすべて） | [MIT License](LICENSE) |
| 掲載コンテンツ（プロフィール文、画像、作品紹介など）: `src/content/`、`src/assets/`、`public/` 配下の画像 | All rights reserved. 無断での複製・転載・再配布を禁じます |

The source code is licensed under the MIT License. The published content (profile text, images, project descriptions), located in `src/content/`, `src/assets/` and images under `public/`, is Copyright (c) 2026 Izu-san, all rights reserved.
