import { App } from 'aws-cdk-lib';
import { REGION } from '../lib/config.ts';
import { SiteStack } from '../lib/site-stack.ts';

const app = new App();

new SiteStack(app, 'IzuSanSite', {
  // 証明書と CloudFront 用 WAF が us-east-1 を必要とするため、全体を us-east-1 に置く。
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
  enableProductionAlias: app.node.tryGetContext('enableProductionAlias') === true ||
    app.node.tryGetContext('enableProductionAlias') === 'true',
});
