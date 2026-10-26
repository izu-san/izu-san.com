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
| Function | 環境ごとの viewer-request Function（今は何もしない仮コード。認証と URL 書き換えは ZJS-7） |
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

## bootstrap と権限

- 初回だけ `cdk bootstrap aws://<アカウント>/us-east-1` が必要。CDKToolkit スタック（アセット用 S3 バケット、ECR リポジトリ、IAM ロール）を作る。S3 の保管料が少額かかりうる。
- bootstrap とデプロイの権限は、コンテンツ公開の権限と分ける（仕様書 §9.3、ZJS-8）。
- Route 53 の変更権限は、`izu-san.com`、`preview.izu-san.com` と ACM 検証レコードに限る。
- 料金プランの権限は `pricingplanmanager` の `CreateSubscription`・`GetSubscription`・`ListSubscriptions`・`CancelSubscription` に限り、`ApprovePaidSubscription` と `UpdateSubscription` は付与しない。

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
