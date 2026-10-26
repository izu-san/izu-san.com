# CLAUDE.md

いづさん（Izu-san）のポートフォリオサイト `izu-san.com` のリポジトリ。ユーザー向けの文章（チケット、コメント、コミットメッセージ、PR、README）は日本語で書く。

## 概要

- Astro による静的サイト。日本語（`/`）と英語（`/en/`）を同じ内容で同時公開する。
- 公開先は S3 + CloudFront。インフラは AWS CDK で管理する。
- 設計仕様書: YouTrack `ZJS-A-1`「いづさん ポートフォリオサイト 設計仕様書」。作業前に、関係する章（要件 §2、対象外 §3、ビジュアル §7、AWS §8、CI/CD §9、受け入れ条件 §13）を確認する。仕様書と食い違う決定をしたら、仕様書に反映する。
- 作業は YouTrack の `ZJS` プロジェクトのチケットに紐付ける（`youtrack-ticket-dev` スキルの手順に従う）。

## ブランチ運用

- `main`: 本番公開用。push で本番公開される。
- `preview`: 共有プレビュー用。push でプレビュー公開される。
- 作業ブランチ `<ISSUE-ID>-<短い英語の説明>` → `preview`（`--no-ff`）→ 表示確認 → `preview` から `main` へ PR（マージコミット、squash しない）。
- `main` への直接 push は禁止（GitHub のブランチ保護で PR 必須、管理者にも適用）。小さな修正でも作業ブランチ → `preview` → PR を経由する。
- PR では検証のみを行い、AWS 権限を付けない。マージはサイト所有者が行う。

## コミット

- 1 コミット 1 目的。メッセージは日本語で、先頭にチケット ID を付ける: `ZJS-12: プロフィールセクションを追加`。
- 例外: Dependabot の更新 PR・コミット（`chore(deps): ...`、`chore(ci): ...`）には、チケット ID を付けない。

## 確認コマンド

Node.js は `.nvmrc`、pnpm は `package.json` の `packageManager` で固定している。

```bash
pnpm install --frozen-lockfile  # 依存関係の取得（ロックファイルどおり）
pnpm check                      # 型チェック（astro check）。コンテンツの検証も含む
pnpm test                       # スキーマ検証のテスト（翻訳の欠落などを検出）
pnpm build                      # 静的ファイルを dist/ に生成
pnpm verify                     # check・test・build をまとめて実行（CI と同じ検証）
pnpm dev / pnpm preview         # 開発サーバー / ビルド結果の確認
```

コンテンツのスキーマは `src/lib/schemas.ts`、データは `src/content/`。日英の欠落や空欄、定義外の項目は `pnpm check` と `pnpm build` で失敗する。

## 守ること

- 日英は同じ内容を揃える。片方だけの変更で終わらせない。
- シークレット、プレビューの認証情報（ハッシュを含む）、AWS キー、非公開の会社名、個人情報をコミットしない。パブリックリポジトリである。
- 仕様書の「対象外」（§3）を実装しない。
- AWS・DNS・GitHub の設定変更は、実行前にサイト所有者へ確認する。既存の MX・TXT などの DNS は変更しない。
- ライセンス: ソースコードは MIT、掲載コンテンツ（`src/content/`、`src/assets/` など）は All rights reserved。
- エージェント関連のディレクトリは、自作の `.claude/skills/youtrack-ticket-dev/` だけを追跡する（`.gitignore` 参照）。
