import { App } from 'aws-cdk-lib';
import { REGION } from '../lib/config.ts';
import { CostStack } from '../lib/cost-stack.ts';
import { DeployerStack } from '../lib/deployer-stack.ts';
import { SiteStack } from '../lib/site-stack.ts';

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION };

// 「user:pass」の SHA-256。未設定なら、プレビューは全リクエストを拒否する（認証なしで公開しない）。
const previewAuthSha256 = process.env.PREVIEW_AUTH_SHA256 || undefined;

new SiteStack(app, 'IzuSanSite', {
  // 証明書と CloudFront 用 WAF が us-east-1 を必要とするため、全体を us-east-1 に置く。
  env,
  previewAuthSha256,
  enableProductionAlias: app.node.tryGetContext('enableProductionAlias') === true ||
    app.node.tryGetContext('enableProductionAlias') === 'true',
});

// GitHub Actions の OIDC とインフラ更新用ロール。管理者が最初に 1 回だけ適用する（docs/infra.md）。
new DeployerStack(app, 'IzuSanDeployer', { env });

// 費用通知（ZJS-13）。通知先をリポジトリに載せないため、COST_ALERT_EMAIL があるときだけ作る。管理者が手動で適用する。
const costAlertEmail = process.env.COST_ALERT_EMAIL;
if (costAlertEmail) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(costAlertEmail)) throw new Error('COST_ALERT_EMAIL がメールアドレスの形式ではありません');
  new CostStack(app, 'IzuSanCost', { env, alertEmail: costAlertEmail });
}
