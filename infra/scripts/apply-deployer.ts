// IzuSanDeployer（OIDC・インフラ更新用ロール・CloudFormation の実行ポリシー）を、管理者の認証情報で適用する。
//   pnpm deployer:apply
// 手順: cdk synth → 変更セットの作成 → 内容の表示 → 確認（y/N）→ 実行 → 完了待ち。
// bootstrap より先に適用できるよう、`cdk deploy` ではなく CloudFormation で直接適用する（docs/infra.md）。
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const REGION = 'us-east-1';
const STACK = 'IzuSanDeployer';
const TEMPLATE = `cdk.out/${STACK}.template.json`;

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  } catch (error) {
    if (options.allowFailure) return '';
    throw error;
  }
}
const aws = (...args: string[]) => run('aws', ['--region', REGION, ...args]);

process.on('uncaughtException', (error) => {
  // 認証情報の不足などで失敗したとき、スタックトレースではなく要点だけを出す。
  console.error(`失敗しました: ${error.message.split('\n')[0]}`);
  process.exit(1);
});

console.log('1/4 テンプレートを生成する');
run('pnpm', ['exec', 'cdk', 'synth', STACK, '--exclusively', '-q']);

console.log('2/4 変更セットを作る（まだ適用しない）');
const identity = JSON.parse(aws('sts', 'get-caller-identity', '--output', 'json'));
console.log(`    認証情報: ${identity.Arn}`);
const deployOutput = aws(
  'cloudformation', 'deploy', '--stack-name', STACK, '--template-file', TEMPLATE,
  '--capabilities', 'CAPABILITY_NAMED_IAM', '--no-execute-changeset',
);
if (/No changes to deploy/.test(deployOutput)) {
  console.log('変更はありません。');
  process.exit(0);
}

const changeSetId = aws(
  'cloudformation', 'list-change-sets', '--stack-name', STACK,
  '--query', 'sort_by(Summaries,&CreationTime)[-1].ChangeSetId', '--output', 'text',
).trim();

console.log('3/4 変更内容');
console.log(
  aws(
    'cloudformation', 'describe-change-set', '--stack-name', STACK, '--change-set-name', changeSetId,
    '--query', 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]',
    '--output', 'table',
  ),
);
console.log('    置換（Replacement が True）や削除（Remove）があるときは、適用せずに内容を確認する。');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('この変更を適用しますか？ [y/N] ')).trim().toLowerCase();
rl.close();
if (answer !== 'y') {
  aws('cloudformation', 'delete-change-set', '--stack-name', STACK, '--change-set-name', changeSetId);
  console.log('適用せず、変更セットを削除しました。');
  process.exit(1);
}

console.log('4/4 適用する');
aws('cloudformation', 'execute-change-set', '--stack-name', STACK, '--change-set-name', changeSetId);
const status = aws('cloudformation', 'describe-stacks', '--stack-name', STACK, '--query', 'Stacks[0].StackStatus', '--output', 'text').trim();
const waiter = status.startsWith('CREATE') || status === 'REVIEW_IN_PROGRESS' ? 'stack-create-complete' : 'stack-update-complete';
aws('cloudformation', 'wait', waiter, '--stack-name', STACK);
console.log(`完了: ${aws('cloudformation', 'describe-stacks', '--stack-name', STACK, '--query', 'Stacks[0].StackStatus', '--output', 'text').trim()}`);
