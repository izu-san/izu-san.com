---
name: youtrack-ticket-dev
description: YouTrack の ZJS プロジェクト（自己紹介サイト izu-san.com）のチケットを起点に開発する（チケット取得 → ブランチ → 実装 → コミット → プレビュー確認 → チケット更新）。「チケットを進めて」「ZJS-1 をやって」「新しい作業をチケット化して」などで使う。
---

# YouTrack チケット駆動開発

作業は必ず YouTrack の `ZJS` プロジェクトのチケットに紐付ける。YouTrack の操作は `mcp__youtrack__*` ツール（未ロードなら ToolSearch で `select:` して読み込む）を使う。ユーザー向けの文章（チケット本文、コメント、コミットメッセージ、PR）は日本語で書く。

## 0. プロジェクトの固定値（確認済み、毎回調べ直さない）

- プロジェクトキー: `ZJS`（名前: 自己紹介サイト）
- State の値: `To do` / `In Progress` / `Done`
  - 着手 = `In Progress`、レビュー依頼中も `In Progress` のまま（Assignee を `izu-san` にして区別する）、完了 = `Done`
- Priority の値: `Critical` / `Major` / `Normal` / `Minor`
- ユーザー（Assignee は login で指定）: `codex-bot`（エージェント ちゃん）、`izu-san`（いづ さん）。`通知専用` は通知用なので担当にしない。
- 作業時間の種別: `レビュー` / `テスト` / `ドキュメント` / `調査` / `実装` / `その他`
- リポジトリ: GitHub の `izu-san/izu-san.com`（パブリック、https://github.com/izu-san/izu-san.com）。PR・Actions の操作は `gh` CLI を使う（GitLab MCP は使わない）。
- 本番: https://izu-san.com ／ プレビュー: https://preview.izu-san.com（Basic 認証あり）

## 1. チケットを決める

- ID 指定あり: `get_issue` で本文を、`get_issue_comments` でコメントを読む。
- ID 指定なし: `search_issues` で `project: ZJS` の自分担当・未完了を探し、候補を提示して選んでもらう。
- 作業に対応するチケットが無い場合: `create_issue`（プロジェクトは `ZJS`）で作る前に、タイトルと概要をユーザーに確認する。フィールドの値は上記の固定値を使う。
- 受け入れ条件が不明確なら、実装前にユーザーへ確認する。
- 仕様書（YouTrack の `ZJS-A-1`「いづさん ポートフォリオサイト 設計仕様書」）を読む。章が多いので、チケットに関係する章（要件 §2、対象外 §3、URL・多言語 §6、ビジュアル §7、AWS §8、CI/CD §9、受け入れ条件 §13 など）は必ず確認する。チケットに参照として書かれた記事は `get_article` で読む。子記事が増えたら `ZJS-A-1` から探す。

## 2. 着手

- 作業開始時に、チケットの State を `In Progress` に更新し（`update_issue`）、Assignee を `codex-bot` にする（`change_issue_assignee`）。
- `main` から作業ブランチを切る: `git switch -c <ISSUE-ID>-<短い英語の説明>`（例: `ZJS-12-add-profile-section`）。

## 3. 実装

- チケットの範囲だけを変更する。範囲外で見つけた問題は `create_issue` で別チケット化し、必要なら `link_issues` で関連付ける。
- 仕様書の「対象外」（§3）と、避ける表現・デザイン方針（§2、§7）に反しない。UI を作る・直すときは `impeccable` などのデザインスキルを使ってよい。
- 日英は同じ内容を揃える。片方だけの変更で終わらせない。
- AWS・DNS・GitHub 設定など外部環境を変える操作は、実行前にユーザーへ確認する（既存の MX・TXT などの DNS は変更しない）。
- 確認方法は、リポジトリにある手順（`package.json` のスクリプト、README、CI の設定）に従う。確認できなかった点は隠さずコメントに書く。

## 4. コミット

- 1 コミット 1 目的。メッセージは日本語で、先頭にチケット ID を付ける: `ZJS-12: プロフィールセクションを追加`。
- ロジック・インフラ・認証に関わるコミットの前に、`/security-review` などでシークレットの混入（プレビューの認証情報、AWS キー）と権限の広がりを確認する。パブリックリポジトリなので、非公開の会社名や個人情報を含めない。

## 5. 仕様書への反映

レビュー依頼の前に、次を行う。

1. 仕様書と食い違う点や、仕様書に無いが決めたこと（配色・書体・バージョン固定など、仕様書が「実装時に決める」としたものを含む）を洗い出す。
2. 反映が必要なものがあれば、更新する記事と文案をユーザーに提案する。
3. ユーザーが了承したら、`update_article` で記事を更新する。
4. チケットのコメントに、更新した記事と変更の要点を書く（6 の報告コメントにまとめてよい）。

## 6. 作業完了時（プレビュー確認 → レビュー依頼）

仕様書 §9.1 のブランチ運用に従う: 作業ブランチ → `preview` で表示確認 → `preview` から `main` へ PR。PR は必ず `preview` を head にする（作業ブランチから直接 `main` へ PR を出さない）。

1. `add_issue_comment` で、変更内容・確認方法・セキュリティ確認の結果・未確認事項・ブランチ名/コミットを報告する。
2. 作業ブランチを `git push -u origin <ブランチ名>` で push する。
3. `preview` に作業ブランチを反映する。`preview` は共有で、push するとプレビュー公開されるため、反映前に次を行う。
   - `git fetch` のうえ、`preview` に `main` 未反映の他の変更が載っていないか確認する（`git log origin/main..origin/preview`）。載っていれば、内容をユーザーに伝えて扱いを確認する。
   - `preview` への反映をユーザーに提案し、了承を得てから行う: `git switch preview` → `git pull --ff-only` → `git merge --no-ff <ブランチ名>` → `git push origin preview`。
   - 公開後は `gh run list` / `gh run view` で Actions の結果を確かめ、失敗したらログを読んで直す。ユーザーにプレビュー（https://preview.izu-san.com）での表示確認を依頼する。
4. 表示確認が済んだら、`gh pr create --base main --head preview` で PR を作る。タイトルは `<ISSUE-ID>: <日本語のタイトル>`、本文は日本語で変更内容と確認方法を書く。`preview` に複数チケットの変更が載っているときは、本文にチケット ID を列挙する。PR の URL を控える。すでに `preview` から `main` への PR が開いていれば、新規作成せず本文を更新する。
5. `gh pr checks` で PR の検証（型・コンテンツ・日英の必須項目・ビルド）の結果を確かめる。PR では検証のみで公開されない。失敗したらログを読み、作業ブランチで直して 3 から繰り返す。
6. チケットの State は `In Progress` のままにし、Assignee を `izu-san` にする。PR の URL をチケットのコメントに残す。
7. ユーザーに PR の URL を伝え、マージを待つ。マージは必ずユーザーが行う（`gh pr merge` は使わない）。`main` へのマージで本番公開される。

## 7. マージ後の後始末

ユーザーが PR をマージしたと伝えたら（または `gh pr view` でマージ済みと確認できたら）、次を行う。

1. `git switch main` → `git pull --ff-only` でローカルの `main` を最新にする。`preview` が `main` より遅れていれば、`preview` に `main` を取り込む（`git switch preview` → `git merge main` → `git push origin preview`）かどうかをユーザーに確認する。
2. マージ済みの作業ブランチを削除する: ローカルは `git branch -d <ブランチ名>`、リモートに残っていれば `git push origin --delete <ブランチ名>`、その後 `git fetch --prune`。`-d` が失敗したら（未マージの可能性）、`-D` にせずユーザーに確認する。`main` と `preview` は削除しない。
3. 本番公開の Actions が成功したか `gh run list` で確かめ、公開内容（HTTPS、日英ページ、404）を必要に応じて確認する。
4. State を `Done` に更新する。

## 補足

- 作業時間を記録する運用なら `log_work` を使う（勝手に記録せず確認する）。
- 上記以外の状態変更は、ユーザーの指示に従う。迷ったら確認する。
