import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DeployerStack } from '../infra/lib/deployer-stack.ts';
import { SiteStack } from '../infra/lib/site-stack.ts';

const env = { account: '123456789012', region: 'us-east-1' };
const PROVIDER = 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com';

const deployer = () => Template.fromStack(new DeployerStack(new App(), 'D', { env }));
const site = () => Template.fromStack(new SiteStack(new App(), 'S', { env }));

// Fn::Join（partition などのトークン）を、aws パーティションの文字列に解決する。
function resolve(value: any): any {
  if (Array.isArray(value)) return value.map(resolve);
  if (value && typeof value === 'object') {
    if ('Fn::Join' in value) {
      const [sep, parts] = value['Fn::Join'];
      return parts.map((p: any) => (typeof p === 'string' ? p : p?.Ref === 'AWS::Partition' ? 'aws' : '?')).join(sep);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  }
  return value;
}

type Statement = { Action: string | string[]; Resource: unknown; Effect: string; Condition?: unknown; Sid?: string };

function roleByName(t: Template, roleName: string) {
  const found = Object.values(t.findResources('AWS::IAM::Role')).filter(
    (r) => r.Properties.RoleName === roleName,
  );
  assert.equal(found.length, 1, `${roleName} が 1 つだけある`);
  return found[0].Properties;
}

function trustConditions(role: { AssumeRolePolicyDocument: { Statement: Array<Record<string, any>> } }) {
  const statements = role.AssumeRolePolicyDocument.Statement;
  assert.equal(statements.length, 1);
  assert.equal(statements[0].Action, 'sts:AssumeRoleWithWebIdentity');
  return statements[0].Condition.StringEquals as Record<string, string>;
}

// ロールに付いたポリシー（AWS::IAM::Policy）の文を集める。
function policyStatements(t: Template, roleName: string): Statement[] {
  const roles = t.findResources('AWS::IAM::Role');
  const logicalId = Object.keys(roles).find((id) => roles[id].Properties.RoleName === roleName)!;
  return Object.values(t.findResources('AWS::IAM::Policy'))
    .filter((p) => JSON.stringify(p.Properties.Roles).includes(logicalId))
    .flatMap((p) => p.Properties.PolicyDocument.Statement);
}

test('OIDC: GitHub のプロバイダーを 1 つ作り、audience は sts.amazonaws.com だけ', () => {
  const t = deployer();
  t.resourceCountIs('AWS::IAM::OIDCProvider', 1);
  t.hasResourceProperties('AWS::IAM::OIDCProvider', {
    Url: 'https://token.actions.githubusercontent.com',
    ClientIdList: ['sts.amazonaws.com'],
  });
});

test('OIDC: インフラ更新ロールの信頼条件は、専用の Environment だけに限定する', () => {
  const t = deployer();
  const deploy = roleByName(t, 'izu-san-infra-deploy');
  assert.deepEqual(trustConditions(deploy as any), {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:izu-san@236948214/izu-san.com@1434149513:environment:infra',
  });
  const diff = roleByName(t, 'izu-san-infra-diff');
  assert.equal(
    trustConditions(diff as any)['token.actions.githubusercontent.com:sub'],
    'repo:izu-san@236948214/izu-san.com@1434149513:environment:infra-diff',
  );
});

test('OIDC: 信頼条件にワイルドカードを使わない', () => {
  const roles = [
    ...Object.values(deployer().findResources('AWS::IAM::Role')),
    ...Object.values(site().findResources('AWS::IAM::Role')),
  ].filter((r) => String(r.Properties.RoleName).startsWith('izu-san-'));
  assert.equal(roles.length, 4);
  for (const r of roles) {
    const conditions = trustConditions(r.Properties);
    assert.deepEqual(Object.keys(r.Properties.AssumeRolePolicyDocument.Statement[0].Condition), ['StringEquals']);
    for (const value of Object.values(conditions)) assert.doesNotMatch(value, /\*/);
    assert.match(conditions['token.actions.githubusercontent.com:sub'], /^repo:izu-san@\d+\/izu-san\.com@\d+:(environment|ref):[\w/.-]+$/);
  }
});

test('OIDC: インフラ更新ロールは CDK の bootstrap ロールを引き受けるだけで、直接は何も変更しない', () => {
  const t = deployer();
  const base = 'arn:aws:iam::123456789012:role/cdk-hnb659fds';
  const deploy = policyStatements(t, 'izu-san-infra-deploy');
  assert.equal(deploy.length, 1);
  assert.equal(deploy[0].Action, 'sts:AssumeRole');
  assert.deepEqual(resolve(deploy[0].Resource), ['deploy', 'file-publishing', 'lookup'].map((k) => `${base}-${k}-role-123456789012-us-east-1`));
  // diff は読み取り用の lookup ロールだけ（deploy ロールは引き受けられない）。
  const diff = policyStatements(t, 'izu-san-infra-diff');
  assert.deepEqual(diff.map((s) => [s.Action, resolve(s.Resource)]), [['sts:AssumeRole', `${base}-lookup-role-123456789012-us-east-1`]]);
});

test('公開ロール: 信頼条件は、対象リポジトリと所定の参照（本番は main、プレビューは preview）だけ', () => {
  const t = site();
  assert.deepEqual(trustConditions(roleByName(t, 'izu-san-publish-production') as any), {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:izu-san@236948214/izu-san.com@1434149513:ref:refs/heads/main',
  });
  assert.deepEqual(trustConditions(roleByName(t, 'izu-san-publish-preview') as any), {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:izu-san@236948214/izu-san.com@1434149513:ref:refs/heads/preview',
  });
  for (const name of ['izu-san-publish-production', 'izu-san-publish-preview']) {
    const principal = (roleByName(t, name) as any).AssumeRolePolicyDocument.Statement[0].Principal;
    assert.deepEqual(resolve(principal), { Federated: PROVIDER });
  }
});

test('公開ロール: 許可は S3 の配置・削除、成果物の読み書き、対象の無効化だけ', () => {
  const t = site();
  const allowed = new Set([
    's3:ListBucket', 's3:GetBucketLocation', 's3:PutObject', 's3:DeleteObject', 's3:GetObject',
    'cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation',
  ]);
  for (const name of ['izu-san-publish-production', 'izu-san-publish-preview']) {
    const policies = Object.values(t.findResources('AWS::IAM::Policy')).filter((p) =>
      JSON.stringify(p.Properties.Roles).includes(name === 'izu-san-publish-production' ? 'ProductionPublishRole' : 'PreviewPublishRole'),
    );
    assert.equal(policies.length, 1, name);
    for (const s of policies[0].Properties.PolicyDocument.Statement as Statement[]) {
      assert.equal(s.Effect, 'Allow');
      for (const a of ([] as string[]).concat(s.Action)) assert.ok(allowed.has(a), `${name}: ${a}`);
      assert.ok(!JSON.stringify(s.Resource).includes('"*"'), `${name}: Resource に * 単体がない`);
    }
  }
});

test('公開ロール: 成果物の保管先は環境ごとの接頭辞に分け、削除権限は公開先だけ', () => {
  const t = site();
  const docs = Object.values(t.findResources('AWS::IAM::Policy')).map((p) => ({
    roles: JSON.stringify(p.Properties.Roles),
    statements: p.Properties.PolicyDocument.Statement as Statement[],
  }));
  for (const [env, other] of [['Production', 'preview'], ['Preview', 'production']]) {
    const d = docs.find((x) => x.roles.includes(`${env}PublishRole`))!;
    const releases = d.statements.find((s) => s.Sid === 'ReadWriteReleases')!;
    const text = JSON.stringify(releases.Resource);
    assert.ok(text.includes(`releases/${env.toLowerCase()}/*`));
    assert.ok(!text.includes(`releases/${other}/`));
    assert.deepEqual(releases.Action, ['s3:PutObject', 's3:GetObject']);
    const del = d.statements.filter((s) => ([] as string[]).concat(s.Action).includes('s3:DeleteObject'));
    assert.deepEqual(del.map((s) => s.Sid), ['DeployToSiteBucket']);
  }
});

test('公開ロール: キャッシュの無効化は、自分の環境のディストリビューションだけ', () => {
  const t = site();
  const dists = Object.entries(t.findResources('AWS::CloudFront::Distribution')).map(([id]) => id);
  assert.equal(dists.length, 2);
  for (const p of Object.values(t.findResources('AWS::IAM::Policy'))) {
    const inv = (p.Properties.PolicyDocument.Statement as Statement[]).find((s) => s.Sid === 'InvalidateDistribution')!;
    const refs = JSON.stringify(inv.Resource);
    assert.equal(dists.filter((d) => refs.includes(d)).length, 1);
  }
});

test('実行ポリシー: Route 53 の変更は条件キーで絞り、料金プランの有料化は許可しない', () => {
  const t = deployer();
  const policy = Object.values(t.findResources('AWS::IAM::ManagedPolicy'))[0].Properties;
  assert.equal(policy.ManagedPolicyName, 'izu-san-cfn-execution');
  const statements = policy.PolicyDocument.Statement as Statement[];
  const change = statements.find((s) => s.Sid === 'Route53ChangeSiteRecords')!;
  assert.deepEqual(resolve(change.Resource), 'arn:aws:route53:::hostedzone/Z02026301S9QD7NZG599M');
  assert.deepEqual(change.Condition, {
    'ForAllValues:StringEquals': { 'route53:ChangeResourceRecordSetsActions': ['CREATE', 'UPSERT', 'DELETE'] },
    'ForAllValues:StringLike': {
      'route53:ChangeResourceRecordSetsNormalizedRecordNames': ['izu-san.com', 'preview.izu-san.com', '_*.izu-san.com', '_*.preview.izu-san.com'],
      'route53:ChangeResourceRecordSetsRecordTypes': ['A', 'AAAA', 'CNAME'],
    },
  });
  const allowed = statements.filter((s) => s.Effect === 'Allow');
  const actions = allowed.flatMap((s) => ([] as string[]).concat(s.Action));
  // 有料化に使う 2 つは、許可の文に含めず、明示的な Deny で拒否する。
  assert.ok(!actions.some((a) => /ApprovePaidSubscription|UpdateSubscription/.test(a)));
  const deny = statements.find((s) => s.Sid === 'DenyPaidPlans')!;
  assert.equal(deny.Effect, 'Deny');
  assert.deepEqual(deny.Action, ['pricingplanmanager:ApprovePaidSubscription', 'pricingplanmanager:UpdateSubscription']);
  assert.ok(!actions.includes('route53:*') && !actions.includes('iam:*') && !actions.includes('*'));
  assert.ok(actions.includes('pricingplanmanager:*'));
  // プランの作成が読む依存先（Shield・Free Tier）は読み取りだけ。
  assert.ok(actions.includes('shield:List*') && actions.includes('freetier:Get*'));
  assert.ok(!actions.some((a) => /^shield:(\*|Create|Update|Delete|Associate|Disassociate)/.test(a)));
  // bootstrap の版を読む権限は、そのパラメーター 1 つだけ。
  const ssm = statements.find((s) => s.Sid === 'BootstrapVersion')!;
  assert.equal(ssm.Action, 'ssm:GetParameters');
  assert.equal(resolve(ssm.Resource), 'arn:aws:ssm:us-east-1:123456789012:parameter/cdk-bootstrap/hnb659fds/version');
  // IAM は公開用ロールだけ。
  const iamStatement = statements.find((s) => s.Sid === 'PublishRoles')!;
  assert.deepEqual(resolve(iamStatement.Resource), [
    'arn:aws:iam::123456789012:role/izu-san-publish-production',
    'arn:aws:iam::123456789012:role/izu-san-publish-preview',
  ]);
  assert.ok(!([] as string[]).concat(iamStatement.Action).includes('iam:PassRole'));
});

test('ワークフロー: Pull Request に AWS の権限を付けない', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const triggersPr = /^\s*pull_request(_target)?:/m.test(text);
    if (!triggersPr) continue;
    assert.doesNotMatch(text, /id-token:\s*write/, `${file}: PR のワークフローに id-token: write がある`);
    assert.doesNotMatch(text, /configure-aws-credentials|role-to-assume|AWS_/, `${file}: PR のワークフローが AWS を使う`);
    assert.doesNotMatch(text, /pull_request_target/, `${file}: pull_request_target は使わない`);
  }
});

test('ワークフロー: インフラ適用は手動起動で、deploy は承認必須の Environment を使い、diff を先に出す', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../.github/workflows/infra.yml', import.meta.url), 'utf8');
  assert.match(text, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(text, /^\s+(push|pull_request|schedule):/m);
  assert.match(text, /environment:\s*infra-diff/);
  assert.match(text, /environment:\s*infra\s*$/m);
  assert.match(text, /needs:\s*diff/);
  assert.ok(text.indexOf('cdk diff') < text.indexOf('cdk deploy'));
  assert.match(text, /refs\/heads\/main/);
  assert.match(text, /cancel-in-progress:\s*false/);
  assert.match(text, /--require-approval never/);
});

test('IAM: 説明文は Latin-1 の範囲に収める（日本語だと CloudFormation が拒否する）', () => {
  for (const t of [deployer(), site()]) {
    const described = [
      ...Object.values(t.findResources('AWS::IAM::Role')),
      ...Object.values(t.findResources('AWS::IAM::ManagedPolicy')),
    ].filter((r) => r.Properties.Description !== undefined);
    assert.ok(described.length > 0);
    for (const r of described) assert.match(r.Properties.Description, /^[\u0009\u000A\u000D -~¡-ÿ]*$/);
  }
});

test('IzuSanDeployer: bootstrap より先に適用できるよう、bootstrap の版チェックを含まない', () => {
  const template = deployer().toJSON();
  assert.equal(template.Parameters?.BootstrapVersion, undefined);
  assert.equal(template.Rules?.CheckBootstrapVersion, undefined);
});
