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
