// 配信先の固定値。シークレットは含めない。
export const REGION = 'us-east-1';
export const ZONE_NAME = 'izu-san.com';
export const ZONE_ID = 'Z02026301S9QD7NZG599M';

export type EnvironmentName = 'production' | 'preview';

export const ENVIRONMENTS: Record<EnvironmentName, { domainName: string }> = {
  production: { domainName: 'izu-san.com' },
  preview: { domainName: 'preview.izu-san.com' },
};

// 費用通知（ZJS-13）の対象を絞るタグ。
export const COST_TAG_KEY = 'Project';
export const COST_TAG_VALUE = 'izu-san.com';

// GitHub Actions から AWS へ入るための固定値（ZJS-8）。
export const GITHUB_REPO = 'izu-san/izu-san.com';
// このリポジトリは OIDC の sub に不変の ID（所有者・リポジトリの数値 ID）を使う設定。
// 名前の変更や移管・再作成で、別のリポジトリが同じ sub を名乗れないようにするため。
// `gh api repos/izu-san/izu-san.com/actions/oidc/customization/sub` で確認できる。
export const GITHUB_SUB_PREFIX = 'repo:izu-san@236948214/izu-san.com@1434149513';
export const OIDC_PROVIDER_HOST = 'token.actions.githubusercontent.com';
// 承認の要らない `cdk diff` 用と、承認必須の `cdk deploy` 用の GitHub Environment。
export const DIFF_ENVIRONMENT = 'infra-diff';
export const DEPLOY_ENVIRONMENT = 'infra';
// CDK bootstrap の既定の修飾子。
export const BOOTSTRAP_QUALIFIER = 'hnb659fds';

export const ROLE_NAMES = {
  diff: 'izu-san-infra-diff',
  deploy: 'izu-san-infra-deploy',
  publish: { production: 'izu-san-publish-production', preview: 'izu-san-publish-preview' },
} as const;
export const CFN_EXECUTION_POLICY_NAME = 'izu-san-cfn-execution';

// 公開ロールが信頼する参照。本番は main、プレビューは preview だけ。
export const PUBLISH_REFS: Record<EnvironmentName, string> = {
  production: 'refs/heads/main',
  preview: 'refs/heads/preview',
};
