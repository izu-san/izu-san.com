# インフラ（AWS CDK）

us-east-1 の 1 スタック `IzuSanSite` で、本番とプレビューの配信基盤を定義する（仕様書 `ZJS-A-1` §8）。

## 構成

| 対象 | 内容 |
| --- | --- |
| S3 | 本番・プレビューの非公開バケット（Block Public Access 有効、OAC 経由のみ）と、成果物保管用バケット（`releases/` に 30 日のライフサイクル） |
| CloudFront | 本番・プレビューを独立したディストリビューションにする。HTTP→HTTPS 転送、AWS 管理のキャッシュポリシーと `SecurityHeadersPolicy`、403/404→`/404.html`（応答 404） |
| ACM | 環境ごとに DNS 検証の証明書（`izu-san.com`、`preview.izu-san.com`） |
| WAF | 環境ごとに、ルール 0 件の Web ACL（定額プランに必須） |
| 料金プラン | `AWS::PricingPlanManager::Subscription`（`CloudFront` / `FREE`）。ディストリビューションと Web ACL を環境ごとに登録する |
| Function | 環境ごとの viewer-request Function（`infra/functions/viewer-request.js`）。プレビューは Basic 認証、両環境で URL の書き換えと 301 転送 |
| Route 53 | 既存ホストゾーンは参照のみ。追加するのは ACM 検証レコードとプレビューの A/AAAA Alias だけ |

全リソースに `Project=izu-san.com` のタグを付ける（費用通知 ZJS-13 で使う）。

## 本番の Alias

本番の A/AAAA Alias は、context `enableProductionAlias` が `true` のときだけ作る（既定は `false`）。有効にするのは ZJS-14。

```bash
pnpm exec cdk synth -c enableProductionAlias=true
```

## 確認コマンド

```bash
pnpm test                 # synth のテスト（tests/infra.test.ts）
pnpm exec cdk synth -q    # テンプレートの生成
pnpm exec cdk diff        # 適用済みとの差分（AWS の認証情報が必要）
```

`CDK_DEFAULT_ACCOUNT` が未設定でも synth はできる。`cdk diff` と `cdk deploy` は、対象アカウントの認証情報で実行する。

## GitHub Actions の権限（OIDC、ZJS-8）

GitHub Actions は、長期のアクセスキーを持たず、OIDC の一時認証で AWS に入る。信頼条件は、すべて `StringEquals`（ワイルドカードなし）で、`aud=sts.amazonaws.com` と、次の `sub` に限る。

| ロール | 定義 | 信頼する `sub` | できること |
| --- | --- | --- | --- |
| `izu-san-publish-production` | `IzuSanSite` | `repo:izu-san/izu-san.com:ref:refs/heads/main` | 本番の S3 への配置・削除、`releases/production/` の読み書き、本番ディストリビューションのキャッシュ無効化 |
| `izu-san-publish-preview` | `IzuSanSite` | `repo:izu-san/izu-san.com:ref:refs/heads/preview` | プレビューの S3 への配置・削除、`releases/preview/` の読み書き、プレビューのディストリビューションのキャッシュ無効化 |
| `izu-san-infra-diff` | `IzuSanDeployer` | `repo:izu-san/izu-san.com:environment:infra-diff` | CDK の lookup ロール（読み取りのみ）を引き受けて `cdk diff` する |
| `izu-san-infra-deploy` | `IzuSanDeployer` | `repo:izu-san/izu-san.com:environment:infra` | CDK の deploy・file-publishing・lookup ロールを引き受けて `cdk deploy` する |

- Pull Request のワークフロー（`verify.yml`）は `contents: read` だけで、`id-token: write` を持たない。OIDC の `sub` も PR のものは通らない。`tests/oidc.test.ts` が、PR で動くワークフローに AWS 関連の設定が入らないことを確認する。
- `infra-diff` は承認なしで動くが、引き受けられるのは読み取り専用の lookup ロールだけ。インフラの更新に使うロール（`izu-san-infra-deploy`）の信頼条件は、承認必須の Environment `infra` だけ。
- 成果物の保管先は環境ごとの接頭辞（`releases/production/<コミットID>/`、`releases/preview/<コミットID>/`）に分け、プレビューのロールが本番の保管済み成果物（ロールバックの元）を書き換えられないようにする。ライフサイクルの `releases/` 30 日は、両方に効く。
- CloudFormation の実行ポリシー（`izu-san-cfn-execution`）は管理者権限にせず、S3・CloudFront・ACM・WAF、料金プラン（`CreateSubscription`・`GetSubscription`・`ListSubscriptions`・`CancelSubscription` のみ）、Route 53、公開用ロールの IAM だけを許可する。
  - Route 53 の変更は条件キーで絞れる。対象は、このホストゾーンの `izu-san.com`・`preview.izu-san.com` の A/AAAA と、ACM 検証用の `_*.izu-san.com`・`_*.preview.izu-san.com` の CNAME。MX・TXT・NS・SOA などは拒否される。`_*` は検証レコード以外の `_` で始まる名前の CNAME も許すので、適用前の `route53-before.json` との差分確認は省かない。
  - 初回の適用で権限不足が出たら、拒否された操作だけを足す。広いワイルドカードに戻さない。

### 初期設定（サイト所有者が 1 回だけ。AWS・GitHub の変更なので、実行前に確認する）

1. 管理者権限で `IzuSanDeployer` を適用する（OIDC プロバイダー、`izu-san-infra-diff`・`izu-san-infra-deploy`、実行ポリシーを作る）。アカウントには GitHub の OIDC プロバイダーがまだ無いことを、`aws iam list-open-id-connect-providers` で確認する。
   ```bash
   pnpm exec cdk diff IzuSanDeployer
   pnpm exec cdk deploy IzuSanDeployer --exclusively
   ```
2. 作った実行ポリシーを使って bootstrap する。
   ```bash
   pnpm exec cdk bootstrap aws://<アカウント>/us-east-1 \
     --cloudformation-execution-policies arn:aws:iam::<アカウント>:policy/izu-san-cfn-execution
   ```
3. GitHub に Environment を作る（リポジトリの Settings → Environments）。
   - `infra-diff`: 承認なし。Deployment branches は `main` だけ。
   - `infra`: Required reviewers にサイト所有者を設定する。起動する人と承認する人が同じになるため、「Prevent self-review」は有効にしない。Deployment branches は `main` だけ。
   - 両方の Environment に、Secret `PREVIEW_AUTH_SHA256` と、変数 `AWS_ACCOUNT_ID` を登録する（下記）。
4. ワークフロー `infra` を手動起動し、`diff` ジョブの要約を確認してから `infra` の承認を行う。

### Secrets と変数の登録

値自体はリポジトリに含めない。GitHub の画面か `gh` で登録する（値は標準入力で渡し、履歴に残さない）。

| 名前 | 種別 | 置き場所 | 内容 |
| --- | --- | --- | --- |
| `PREVIEW_AUTH_SHA256` | Secret | `infra`・`infra-diff` | 「user:pass」の SHA-256（後述の手順で作る） |
| `AWS_ACCOUNT_ID` | Variable | `infra`・`infra-diff` | AWS アカウント ID（ロールの ARN に使う） |

```bash
gh secret set PREVIEW_AUTH_SHA256 --env infra      # 値は標準入力で入力する
gh secret set PREVIEW_AUTH_SHA256 --env infra-diff
gh variable set AWS_ACCOUNT_ID --env infra --body <アカウント ID>
gh variable set AWS_ACCOUNT_ID --env infra-diff --body <アカウント ID>
```

プレビューの平文の資格情報（`user:pass`）は、GitHub Actions では使わない。プレビューの公開ワークフロー（ZJS-9）が必要になったら、公開用の Environment に別途登録する。

## インフラ適用ワークフロー（`infra.yml`）

手動起動のみ（`workflow_dispatch`）。`main` 以外では動かない。

1. `diff` ジョブ（Environment `infra-diff`、承認なし）が `cdk diff` を実行し、ジョブの要約（Summary）に出す。Function に入るプレビュー認証のハッシュは `[REDACTED]` に置き換える。
2. 要約で、置換・削除（`replace`・`destroy`）と IAM の変更を確認する。ディストリビューションの置換・削除は、料金プランの解約が先に必要なので、適用せずサイト所有者に確認する（後述）。
3. `deploy` ジョブ（Environment `infra`）は、必須レビューの承認まで始まらず、AWS の権限も得られない。承認すると、同じコミットで `cdk deploy` する。
4. 実行ログと要約は誰でも読める。資格情報とハッシュを出力に含めない。

### 公開ロールの権限の確認方法

適用後に、公開ロールで引き受けて、許可していない操作が失敗することを確かめる（`main` の公開ワークフロー、または一時的に OIDC でロールを引き受けるジョブで実行する）。

```bash
aws s3 cp x s3://<公開先バケット>/probe          # 成功する（許可した配置）
aws s3 rm s3://<公開先バケット>/probe            # 成功する（許可した削除）
aws s3api put-bucket-policy ...                  # AccessDenied（バケットの設定は変更できない）
aws s3 cp x s3://<別環境のバケット>/probe        # AccessDenied（ほかの環境には書けない）
aws cloudfront update-distribution ...           # AccessDenied（無効化以外はできない）
aws route53 change-resource-record-sets ...      # AccessDenied
```

結果は、チケットのコメントに記録する。

## 料金プランの注意

- CloudFormation はプランの tier を変更しない（変更する更新は拒否される）。
- ディストリビューションを置換・削除する変更は、先にプランの解約が必要。CloudFormation のスタック削除では、解約から削除まで自動で進む（ZJS-2 で確認済み）。置換を含む `cdk diff` が出たら、適用前にサイト所有者へ確認する。
- CLI で確認するとき: `aws pricing-plan-manager list-subscriptions`（連続して呼ぶと `TooManyRequestsException` になることがあるため再試行する）。

## DNS のスナップショット

適用前にホストゾーンの全レコードを保存し、適用後に比較する。

```bash
aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID> > route53-before.json
```

スナップショットには DKIM などが含まれるため、リポジトリにはコミットしない。比較では、追加した ACM 検証レコードとプレビューの Alias 以外に差分がないことを確認する。

## Function（認証・URL 書き換え）

`infra/functions/viewer-request.js` が本体で、`infra/lib/viewer-request.ts` が先頭に `AUTH_REQUIRED` と `AUTH_SHA256` を差し込む。本番とプレビューで別々の Function になる。

- プレビュー（`AUTH_REQUIRED=true`）: すべてのリクエストに Basic 認証を求める。viewer-request なのでキャッシュ参照より前に動き、`*.cloudfront.net` でも同じディストリビューションの Function が動く。認証が通らなければ、転送先も分からないよう 401 を返す。
- ハッシュが未設定・不正のとき、プレビューは**全リクエストを拒否する**（認証なしで公開しない）。
- 本番は認証なしで、書き換え（`/` → `/index.html`、`/en/` → `/en/index.html`）と 301（`/en` → `/en/`、`/index.html` → `/`、`/en/index.html` → `/en/`）だけを行う。クエリ文字列は転送でも保つ。
- 存在しないパスは S3 の 403/404 になり、CloudFront のカスタムエラー応答で `/404.html`（応答 404）に置き換わる。
- Function はログを出力しない。コードは 10KB 未満に収める。
- プレビューのビルドには `PUBLIC_SITE_ENV=preview` を付ける。全ページに `<meta name="robots" content="noindex, nofollow">` が入る（本番は付けない）。サイトマップ（ZJS-12）にはプレビューを含めない。

## プレビュー認証のハッシュとローテーション

平文の資格情報（`user:pass`）は GitHub Secrets など、リポジトリの外で管理する。Function に入るのは SHA-256 のハッシュだけで、`cdk synth`／`deploy` を実行する環境の環境変数 `PREVIEW_AUTH_SHA256` で渡す。ハッシュは CloudFormation テンプレートと Function コードに残るため、リポジトリ・ログ・成果物に出さない（`cdk.out` は ignore 済み）。

1. 新しい資格情報を作る。ハッシュはソルトなしの高速な SHA-256 で（CloudFront Functions では bcrypt などが使えない）、漏れると総当たりが速いため、パスワードは 32 文字以上の長いランダム文字列にする。スクリプトは 32 文字未満を拒否する。例: `openssl rand -base64 36`。
2. ハッシュを作る。引数や履歴に残さないよう、標準入力で渡す。
   ```bash
   read -rs CRED   # 「user:pass」を入力
   printf '%s' "$CRED" | node infra/scripts/hash-preview-auth.ts
   unset CRED
   ```
3. GitHub Secrets の平文と、`PREVIEW_AUTH_SHA256`（ハッシュ）を更新する。
4. インフラ更新（承認付きの手動ワークフロー、ZJS-8）で Function を再デプロイする。再デプロイ前は古い資格情報が有効で、反映後は新しい資格情報だけが通る。
5. 新しい資格情報で認証でき、古い資格情報と認証なしが 401 になることを確認する。

資格情報はほかのサービスと共用しない。Function の設定を読める管理者にはハッシュが見えるため、管理権限を限定する。
