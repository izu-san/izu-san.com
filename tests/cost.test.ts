import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CostStack } from '../infra/lib/cost-stack.ts';

const env = { account: '123456789012', region: 'us-east-1' };

function synth() {
  const app = new App();
  return Template.fromStack(new CostStack(app, 'TestCost', { env, alertEmail: 'owner@example.com' }));
}

test('費用通知: 月 1 ドルと 3 ドルの予算を、Project タグで絞って作る', () => {
  const budgets = Object.values(synth().findResources('AWS::Budgets::Budget'));
  assert.deepEqual(
    budgets.map((b) => b.Properties.Budget.BudgetLimit.Amount).sort(),
    [1, 3],
  );
  for (const b of budgets) {
    assert.equal(b.Properties.Budget.TimeUnit, 'MONTHLY');
    assert.deepEqual(b.Properties.Budget.CostFilters, { TagKeyValue: ['user:Project$izu-san.com'] });
  }
});

test('費用通知: 実績と予測の両方を、100% 超過で指定のメールへ通知する', () => {
  for (const b of Object.values(synth().findResources('AWS::Budgets::Budget'))) {
    const subs = b.Properties.NotificationsWithSubscribers;
    assert.deepEqual(subs.map((s: any) => s.Notification.NotificationType).sort(), ['ACTUAL', 'FORECASTED']);
    for (const s of subs) {
      assert.equal(s.Notification.Threshold, 100);
      assert.equal(s.Notification.ThresholdType, 'PERCENTAGE');
      assert.deepEqual(s.Subscribers, [{ SubscriptionType: 'EMAIL', Address: 'owner@example.com' }]);
    }
  }
});

test('費用通知: 予算以外のリソースを作らない', () => {
  assert.deepEqual(Object.keys(synth().toJSON().Resources).length, 2);
});
