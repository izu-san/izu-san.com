import { Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as pricingplanmanager from 'aws-cdk-lib/aws-pricingplanmanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { COST_TAG_KEY, COST_TAG_VALUE, type EnvironmentName } from './config.ts';

export interface SiteEnvironmentProps {
  readonly name: EnvironmentName;
  readonly domainName: string;
  readonly zone: route53.IHostedZone;
  /** A/AAAA Alias を作るか。本番は ZJS-14 まで false。 */
  readonly createAlias: boolean;
}

// viewer-request の仮の Function。認証と URL 書き換えは ZJS-7 で実装する。
// 本番とプレビューで Function を共有しないため、環境ごとに作る。
const PLACEHOLDER_FUNCTION_CODE = `function handler(event) {
  return event.request;
}
`;

/** 1 環境分（S3・CloudFront・ACM・WAF・料金プラン・Alias）。 */
export class SiteEnvironment extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: SiteEnvironmentProps) {
    super(scope, id);
    const stack = Stack.of(this);

    // 非公開バケット。静的ウェブサイトエンドポイントは使わない。
    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // 公開先にはライフサイクルを設定しない（現役のハッシュ付きファイルが消えるため）。
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // DNS 検証の証明書。検証レコードは維持する。
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(props.zone),
    });

    // 定額プランに必須の Web ACL。ルールは 0 件。プランごとに別のものを用意する。
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [],
      visibilityConfig: {
        cloudWatchMetricsEnabled: false,
        sampledRequestsEnabled: false,
        metricName: `${props.name}-web-acl`,
      },
    });

    const viewerRequest = new cloudfront.Function(this, 'ViewerRequest', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(PLACEHOLDER_FUNCTION_CODE),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.domainName],
      certificate,
      webAclId: webAcl.attrArn,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // 定額プランのため AWS 管理ポリシーを使う。Cache-Control は S3 の配置時に付ける。
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
        functionAssociations: [
          { function: viewerRequest, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // S3 の不存在オブジェクトは 403 を返すことがあるため、両方を 404 に揃える。
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: Duration.minutes(1),
      })),
    });

    // Free プランへの登録。Web ACL とディストリビューションを 1 組で関連付ける。
    // 有料プランへの変更は CloudFormation が拒否する。ホストゾーンは関連付けない。
    const subscription = new pricingplanmanager.CfnSubscription(this, 'PricingPlan', {
      planFamily: 'CloudFront',
      planTier: 'FREE',
      resourceArns: [
        stack.formatArn({
          service: 'cloudfront',
          region: '',
          resource: 'distribution',
          resourceName: this.distribution.distributionId,
        }),
        webAcl.attrArn,
      ],
    });
    subscription.node.addDependency(this.distribution);

    if (props.createAlias) {
      const recordTarget = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      );
      const recordName = props.domainName === props.zone.zoneName ? undefined : props.domainName;
      new route53.ARecord(this, 'AliasA', { zone: props.zone, recordName, target: recordTarget });
      new route53.AaaaRecord(this, 'AliasAaaa', { zone: props.zone, recordName, target: recordTarget });
    }

    Tags.of(this).add(COST_TAG_KEY, COST_TAG_VALUE);
    Tags.of(this).add('Environment', props.name);
  }
}
