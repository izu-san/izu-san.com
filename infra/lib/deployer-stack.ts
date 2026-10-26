import { Stack, type StackProps, DefaultStackSynthesizer } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {
  BOOTSTRAP_QUALIFIER,
  CFN_EXECUTION_POLICY_NAME,
  DEPLOY_ENVIRONMENT,
  DIFF_ENVIRONMENT,
  GITHUB_SUB_PREFIX,
  OIDC_PROVIDER_HOST,
  REGION,
  ROLE_NAMES,
  ZONE_ID,
  ZONE_NAME,
} from './config.ts';

/**
 * GitHub Actions がインフラ（CDK）を更新するための入口。サイト所有者が管理者権限で、最初に 1 回だけ適用する。
 *
 * - GitHub の OIDC プロバイダー
 * - `cdk diff` 用ロール（読み取りだけ。Environment `infra-diff` に限定）
 * - `cdk deploy` 用ロール（Environment `infra` に限定。Environment に承認を必須にする）
 * - CloudFormation の実行ポリシー（`cdk bootstrap --cloudformation-execution-policies` に渡す）
 *
 * サイトの公開用ロールは SiteStack 側にある。
 */
export class DeployerStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, {
      ...props,
      // bootstrap より先に適用するため、テンプレートに bootstrap の版チェックを付けない。
      // cdk deploy は bootstrap を前提にするので、`cdk synth` したテンプレートを CloudFormation で直接適用する（docs/infra.md）。
      synthesizer: new DefaultStackSynthesizer({ generateBootstrapVersionRule: false }),
    });

    const provider = new iam.OidcProviderNative(this, 'GitHubOidc', {
      url: `https://${OIDC_PROVIDER_HOST}`,
      clientIds: ['sts.amazonaws.com'],
    });

    const trustFor = (environment: string) =>
      new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${OIDC_PROVIDER_HOST}:aud`]: 'sts.amazonaws.com',
          [`${OIDC_PROVIDER_HOST}:sub`]: `${GITHUB_SUB_PREFIX}:environment:${environment}`,
        },
      });
    const bootstrapRole = (kind: string) =>
      `arn:${this.partition}:iam::${this.account}:role/cdk-${BOOTSTRAP_QUALIFIER}-${kind}-role-${this.account}-${REGION}`;

    // 承認なしで走る diff 用。引き受けられるのは lookup ロール（読み取りのみ）だけ。
    const diffRole = new iam.Role(this, 'DiffRole', {
      roleName: ROLE_NAMES.diff,
      description: 'cdk diff (read-only, GitHub Environment infra-diff)',
      assumedBy: trustFor(DIFF_ENVIRONMENT),
    });
    diffRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [bootstrapRole('lookup')] }),
    );

    // 承認後の deploy 用。CDK の bootstrap ロールを引き受けるだけで、リソースを直接は変更しない。
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: ROLE_NAMES.deploy,
      description: 'cdk deploy (GitHub Environment infra, approval required)',
      assumedBy: trustFor(DEPLOY_ENVIRONMENT),
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['deploy', 'file-publishing', 'lookup'].map(bootstrapRole),
      }),
    );

    // CloudFormation が、スタックのリソースを作るときに使う権限。管理者権限にせず、このサイトに要るものだけにする。
    const zoneArn = `arn:${this.partition}:route53:::hostedzone/${ZONE_ID}`;
    const executionPolicy = new iam.ManagedPolicy(this, 'CfnExecutionPolicy', {
      managedPolicyName: CFN_EXECUTION_POLICY_NAME,
      description: 'CloudFormation execution policy for izu-san.com (passed to cdk bootstrap)',
      statements: [
        new iam.PolicyStatement({
          sid: 'SiteServices',
          actions: ['s3:*', 'cloudfront:*', 'acm:*', 'wafv2:*'],
          resources: ['*'],
        }),
        // テンプレートの BootstrapVersion パラメーター（bootstrap の版）を、CloudFormation が読む。
        new iam.PolicyStatement({
          sid: 'BootstrapVersion',
          actions: ['ssm:GetParameters'],
          resources: [
            `arn:${this.partition}:ssm:${REGION}:${this.account}:parameter/cdk-bootstrap/${BOOTSTRAP_QUALIFIER}/version`,
          ],
        }),
        // 料金プランは、サービス単位で許可する（細かい API 名では、依存先の権限が足りず適用が止まりやすい）。
        // 有料への変更に使う 2 つは、下の明示的な Deny で必ず拒否する。
        new iam.PolicyStatement({
          sid: 'PricingPlan',
          actions: ['pricingplanmanager:*'],
          resources: ['*'],
        }),
        // プランの作成が、呼び出し元の権限で読む項目（Shield の保護、Free Tier の状態）。読み取りだけ。
        new iam.PolicyStatement({
          sid: 'PricingPlanReadDependencies',
          actions: ['shield:List*', 'shield:Describe*', 'shield:Get*', 'freetier:Get*'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'DenyPaidPlans',
          effect: iam.Effect.DENY,
          actions: ['pricingplanmanager:ApprovePaidSubscription', 'pricingplanmanager:UpdateSubscription'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'Route53Read',
          actions: ['route53:GetChange', 'route53:GetHostedZone', 'route53:ListResourceRecordSets'],
          resources: ['*'],
        }),
        // 変更できるのは、このホストゾーンの apex・preview の A/AAAA と、ACM の検証用 CNAME だけ。
        // MX・TXT・NS・SOA と、そのほかの名前は、条件キーで拒否される。
        new iam.PolicyStatement({
          sid: 'Route53ChangeSiteRecords',
          actions: ['route53:ChangeResourceRecordSets'],
          resources: [zoneArn],
          conditions: {
            'ForAllValues:StringEquals': {
              'route53:ChangeResourceRecordSetsActions': ['CREATE', 'UPSERT', 'DELETE'],
            },
            'ForAllValues:StringLike': {
              'route53:ChangeResourceRecordSetsNormalizedRecordNames': [
                ZONE_NAME,
                `preview.${ZONE_NAME}`,
                `_*.${ZONE_NAME}`,
                `_*.preview.${ZONE_NAME}`,
              ],
              'route53:ChangeResourceRecordSetsRecordTypes': ['A', 'AAAA', 'CNAME'],
            },
          },
        }),
        // 公開用ロールだけを作れる。
        new iam.PolicyStatement({
          sid: 'PublishRoles',
          actions: [
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:GetRole',
            'iam:UpdateRole',
            'iam:ListRolePolicies',
            'iam:ListAttachedRolePolicies',
            'iam:ListRoleTags',
            'iam:ListInstanceProfilesForRole',
            'iam:UpdateAssumeRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:GetRolePolicy',
            'iam:TagRole',
            'iam:UntagRole',
          ],
          resources: Object.values(ROLE_NAMES.publish).map(
            (name) => `arn:${this.partition}:iam::${this.account}:role/${name}`,
          ),
        }),
      ],
    });
  }
}
