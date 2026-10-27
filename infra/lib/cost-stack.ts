import { Stack, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';
import { COST_TAG_KEY, COST_TAG_VALUE } from './config.ts';

export interface CostStackProps extends StackProps {
  // 通知先。パブリックリポジトリに載せないため、環境変数 COST_ALERT_EMAIL で渡す。
  alertEmail: string;
}

// サイトによる追加費用（コスト配分タグ Project=izu-san.com）の月額予算。通知だけで、課金は止めない。
export const COST_BUDGET_LIMITS_USD = [1, 3] as const;

export class CostStack extends Stack {
  constructor(scope: Construct, id: string, props: CostStackProps) {
    super(scope, id, props);

    for (const limit of COST_BUDGET_LIMITS_USD) {
      new budgets.CfnBudget(this, `SiteBudget${limit}Usd`, {
        budget: {
          budgetName: `izu-san-site-${limit}usd`,
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: limit, unit: 'USD' },
          // 形式は `user:<キー>$<値>`。タグを課金設定で有効化するまで、費用は 0 のままになる。
          costFilters: { TagKeyValue: [`user:${COST_TAG_KEY}$${COST_TAG_VALUE}`] },
          costTypes: { includeCredit: false, includeRefund: false },
        },
        notificationsWithSubscribers: (['ACTUAL', 'FORECASTED'] as const).map((notificationType) => ({
          notification: {
            notificationType,
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
        })),
      });
    }
  }
}
