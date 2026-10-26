import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SiteStack } from '../infra/lib/site-stack.ts';

const env = { account: '123456789012', region: 'us-east-1' };

// テスト用のハッシュ（本物ではない）。
const TEST_HASH = createHash('sha256').update('tester:not-a-real-credential').digest('hex');

function synth(enableProductionAlias = false, previewAuthSha256: string | undefined = TEST_HASH) {
  const app = new App();
  const stack = new SiteStack(app, 'Test', { env, enableProductionAlias, previewAuthSha256 });
  return Template.fromStack(stack);
}

test('インフラ: S3 はすべて非公開で、ウェブサイトエンドポイントを使わない', () => {
  const t = synth();
  const buckets = t.findResources('AWS::S3::Bucket');
  assert.equal(Object.keys(buckets).length, 3);
  for (const b of Object.values(buckets)) {
    assert.deepEqual(b.Properties.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    assert.equal(b.Properties.WebsiteConfiguration, undefined);
  }
});

test('インフラ: ライフサイクルは成果物保管先にだけ設定する', () => {
  const t = synth();
  const withLifecycle = Object.values(t.findResources('AWS::S3::Bucket')).filter(
    (b) => b.Properties.LifecycleConfiguration,
  );
  assert.equal(withLifecycle.length, 1);
  t.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: {
      Rules: [Match.objectLike({ ExpirationInDays: 30, Prefix: 'releases/', Status: 'Enabled' })],
    },
  });
});

test('インフラ: CloudFront は OAC・HTTPS 転送・管理ポリシー・404 応答を持つ', () => {
  const t = synth();
  assert.equal(Object.keys(t.findResources('AWS::CloudFront::Distribution')).length, 2);
  t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
  t.resourceCountIs('AWS::CloudFront::ContinuousDeploymentPolicy', 0);
  t.allResourcesProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        ResponseHeadersPolicyId: '67f7725c-6f97-4210-82d7-5512b31e9d03',
      }),
      CustomErrorResponses: [
        Match.objectLike({ ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html' }),
        Match.objectLike({ ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html' }),
      ],
    }),
  });
});

test('インフラ: Function・Web ACL・証明書・料金プランを環境ごとに分ける', () => {
  const t = synth();
  t.resourceCountIs('AWS::CloudFront::Function', 2);
  t.resourceCountIs('AWS::WAFv2::WebACL', 2);
  t.resourceCountIs('AWS::CertificateManager::Certificate', 2);
  t.resourceCountIs('AWS::PricingPlanManager::Subscription', 2);
  t.allResourcesProperties('AWS::PricingPlanManager::Subscription', {
    PlanFamily: 'CloudFront',
    PlanTier: 'FREE',
  });
  t.allResourcesProperties('AWS::WAFv2::WebACL', { Scope: 'CLOUDFRONT', Rules: [] });
  t.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'izu-san.com',
    ValidationMethod: 'DNS',
  });
  t.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'preview.izu-san.com',
    ValidationMethod: 'DNS',
  });
});

test('インフラ: 本番の Alias は既定で作らず、プレビューの Alias だけ作る', () => {
  const t = synth();
  const names = Object.values(t.findResources('AWS::Route53::RecordSet')).map((r) => `${r.Properties.Type} ${r.Properties.Name}`);
  assert.deepEqual(names.sort(), ['A preview.izu-san.com.', 'AAAA preview.izu-san.com.']);
});

test('インフラ: フラグを有効にすると本番の Alias を作る', () => {
  const t = synth(true);
  const names = Object.values(t.findResources('AWS::Route53::RecordSet')).map((r) => `${r.Properties.Type} ${r.Properties.Name}`);
  assert.deepEqual(names.sort(), ['A izu-san.com.', 'A preview.izu-san.com.', 'AAAA izu-san.com.', 'AAAA preview.izu-san.com.']);
});

test('インフラ: ホストゾーンを作成せず、追加レコードは Alias だけ', () => {
  const t = synth(true);
  t.resourceCountIs('AWS::Route53::HostedZone', 0);
  for (const r of Object.values(t.findResources('AWS::Route53::RecordSet'))) {
    assert.ok(['A', 'AAAA'].includes(r.Properties.Type));
    assert.ok(r.Properties.AliasTarget);
  }
});

test('インフラ: 費用通知用のタグを付ける', () => {
  const t = synth();
  t.hasResourceProperties('AWS::CloudFront::Distribution', {
    Tags: Match.arrayWith([{ Key: 'Project', Value: 'izu-san.com' }]),
  });
});

function functionCodes(t: Template) {
  return Object.values(t.findResources('AWS::CloudFront::Function')).map(
    (f) => f.Properties.FunctionCode as string,
  );
}

test('インフラ: 認証のハッシュはプレビューの Function だけに入り、本番には入らない', () => {
  const codes = functionCodes(synth());
  assert.equal(codes.length, 2);
  const withHash = codes.filter((c) => c.includes(TEST_HASH));
  assert.equal(withHash.length, 1);
  assert.match(withHash[0], /var AUTH_REQUIRED = true;/);
  const other = codes.find((c) => !c.includes(TEST_HASH))!;
  assert.match(other, /var AUTH_REQUIRED = false;/);
  assert.match(other, /var AUTH_SHA256 = "";/);
});

test('インフラ: ハッシュ未指定でもプレビューは認証必須のまま（全拒否）', () => {
  const codes = functionCodes(synth(false, undefined));
  assert.equal(codes.filter((c) => c.includes('var AUTH_REQUIRED = true;')).length, 1);
  assert.equal(codes.filter((c) => c.includes('var AUTH_REQUIRED = false;')).length, 1);
});

test('インフラ: 不正なハッシュでは synth が失敗する', () => {
  assert.throws(() => synth(false, 'not-a-hash'));
});

test('インフラ: Function は両環境とも viewer-request に 1 つだけ関連付ける', () => {
  const t = synth();
  t.allResourcesProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
      }),
    }),
  });
});
