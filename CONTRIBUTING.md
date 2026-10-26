# コントリビューションについて / Contributing

いづさん（Izu-san）の個人ポートフォリオサイトです。外部からの変更は、小さな不具合の修正や改善の提案を中心に受け付けます。

This is the personal portfolio site of Izu-san. Contributions are welcome mainly as small bug fixes and improvement suggestions.

## 先に相談してください / Open an issue first

- 不具合や要望は、まず [Issue](https://github.com/izu-san/izu-san.com/issues/new/choose) で教えてください。日本語・英語どちらでも構いません。
- 脆弱性は Issue に書かず、[SECURITY.md](SECURITY.md) の方法で非公開に報告してください。
- ブログ、問い合わせフォーム、会員登録、ライトテーマなどは、仕様上の対象外です。

Please start with an issue (Japanese or English). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Blogging, contact forms, sign-up and a light theme are out of scope.

## 開発の手順 / Development

Node.js と pnpm のバージョンは `.nvmrc` と `package.json` の `packageManager` で固定しています。

```bash
pnpm install --frozen-lockfile  # 依存関係の取得 / install dependencies
pnpm verify                     # check・test・build をまとめて実行（CI と同じ検証）
pnpm dev / pnpm preview         # 開発サーバー / ビルド結果の確認
```

## Pull Request を出すとき / Pull requests

- ブランチ運用: 作業ブランチ → `preview` → `main`。`main` への直接 push はできません。外部からの Pull Request は `preview` ブランチ宛にしてください。
- 日本語版と英語版（`/` と `/en/`）は、同じ内容に揃えてください。片方だけの変更は受け付けられません。
- `pnpm verify` が成功することを確認してください。Pull Request でも、同じ検証が自動で実行されます。
- シークレット、認証情報、個人情報、非公開の会社名を含めないでください。
- 依存関係のバージョンは、完全一致で固定しています（`package.json` と `pnpm-lock.yaml`）。更新するときは、`pnpm check` と `pnpm build` が通ることを確認してください。
- 掲載する文章や画像（`src/content/`、`src/assets/` など）は All rights reserved です。内容の差し替えは、サイト所有者が行います。

Branches: working branch → `preview` → `main` (no direct pushes to `main`); please target `preview` from forks. Keep the Japanese and English pages identical, make sure `pnpm verify` passes, and do not include secrets or personal information. Dependencies are pinned to exact versions. Site content (`src/content/`, `src/assets/`) is all rights reserved and is edited by the site owner.

## ライセンス / License

ソースコードは MIT です（[LICENSE](LICENSE)）。掲載コンテンツ（`src/content/`、`src/assets/` など）は All rights reserved です。

Source code is released under the MIT license ([LICENSE](LICENSE)). Site content is all rights reserved.
