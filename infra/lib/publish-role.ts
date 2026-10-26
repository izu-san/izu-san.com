import { Stack } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  GITHUB_REPO,
  OIDC_PROVIDER_HOST,
  PUBLISH_REFS,
  ROLE_NAMES,
  type EnvironmentName,
} from './config.ts';

export interface PublishRoleProps {
  readonly name: EnvironmentName;
  readonly siteBucket: s3.IBucket;
  readonly releasesBucket: s3.IBucket;
  readonly distribution: cloudfront.IDistribution;
}

/**
 * 公開用ロール。GitHub Actions が OIDC で引き受け、サイトの配置とキャッシュ無効化だけを行う。
 * 信頼条件は、対象リポジトリと所定の参照（本番は main、プレビューは preview）に限る。
 */
export class PublishRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: PublishRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    // プロバイダーは IzuSanDeployer が作る。スタック間の参照にせず、ARN で指す。
    const providerArn = `arn:${stack.partition}:iam::${stack.account}:oidc-provider/${OIDC_PROVIDER_HOST}`;

    this.role = new iam.Role(this, 'Role', {
      roleName: ROLE_NAMES.publish[props.name],
      description: `izu-san.com ${props.name} の公開用（GitHub Actions、OIDC）`,
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${OIDC_PROVIDER_HOST}:aud`]: 'sts.amazonaws.com',
          [`${OIDC_PROVIDER_HOST}:sub`]: `repo:${GITHUB_REPO}:ref:${PUBLISH_REFS[props.name]}`,
        },
      }),
    });

    // 成果物は環境ごとの接頭辞に分ける。プレビューのロールが、本番の保管済み成果物
    // （ロールバックの元）を書き換えられないようにする。
    const releasesPrefix = `releases/${props.name}/`;
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ListBuckets',
        actions: ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: [props.siteBucket.bucketArn, props.releasesBucket.bucketArn],
      }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DeployToSiteBucket',
        actions: ['s3:PutObject', 's3:DeleteObject', 's3:GetObject'],
        resources: [props.siteBucket.arnForObjects('*')],
      }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadWriteReleases',
        actions: ['s3:PutObject', 's3:GetObject'],
        resources: [props.releasesBucket.arnForObjects(`${releasesPrefix}*`)],
      }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateDistribution',
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [
          stack.formatArn({
            service: 'cloudfront',
            region: '',
            resource: 'distribution',
            resourceName: props.distribution.distributionId,
          }),
        ],
      }),
    );
  }
}
