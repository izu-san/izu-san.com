import { Duration, RemovalPolicy, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { COST_TAG_KEY, COST_TAG_VALUE, ENVIRONMENTS, ZONE_ID, ZONE_NAME } from './config.ts';
import { SiteEnvironment } from './site-environment.ts';

export interface SiteStackProps extends StackProps {
  /** 本番の A/AAAA Alias を作るか（既定 false。ZJS-14 で有効化する）。 */
  readonly enableProductionAlias?: boolean;
  /** プレビューの「user:pass」の SHA-256。未指定なら、プレビューは全リクエストを拒否する。 */
  readonly previewAuthSha256?: string;
}

/** us-east-1 の 1 スタックに、本番・プレビュー・成果物保管をまとめる。 */
export class SiteStack extends Stack {
  public readonly production: SiteEnvironment;
  public readonly preview: SiteEnvironment;
  public readonly releasesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SiteStackProps = {}) {
    super(scope, id, props);

    // 既存ホストゾーンは参照のみ（作成・管理移管しない）。
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: ZONE_ID,
      zoneName: ZONE_NAME,
    });

    this.production = new SiteEnvironment(this, 'Production', {
      name: 'production',
      domainName: ENVIRONMENTS.production.domainName,
      zone,
      createAlias: props.enableProductionAlias ?? false,
      authRequired: false,
    });
    this.preview = new SiteEnvironment(this, 'Preview', {
      name: 'preview',
      domainName: ENVIRONMENTS.preview.domainName,
      zone,
      createAlias: true,
      authRequired: true,
      authSha256: props.previewAuthSha256,
    });

    // 成功した公開成果物の保管先（releases/<コミットID>/）。
    // ライフサイクルは保管先にだけ設定する。
    this.releasesBucket = new s3.Bucket(this, 'ReleasesBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ prefix: 'releases/', expiration: Duration.days(30) }],
    });
    Tags.of(this.releasesBucket).add(COST_TAG_KEY, COST_TAG_VALUE);
  }
}
