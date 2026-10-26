export const languages = ['ja', 'en'] as const;
export type Lang = (typeof languages)[number];

export const paths: Record<Lang, string> = { ja: '/', en: '/en/' };
export const otherLang = (lang: Lang): Lang => (lang === 'ja' ? 'en' : 'ja');

// セクション ID は日英で共通にする。
export const sectionIds = ['profile', 'works', 'skills', 'career', 'contact'] as const;
export type SectionId = (typeof sectionIds)[number];

interface Ui {
  nav: Record<SectionId, string>;
  switchLabel: string;
  switchText: string;
  tech: string;
  present: string;
  footer: string;
}

// Record<Lang, Ui> により、片方の言語の欠落は型チェック（pnpm check）で失敗する。
export const ui: Record<Lang, Ui> = {
  ja: {
    nav: { profile: 'プロフィール', works: '個人開発', skills: 'スキル', career: '職歴', contact: '連絡・外部リンク' },
    switchLabel: '言語',
    switchText: 'English',
    tech: '使用技術',
    present: '現在',
    footer: '© 2026 Izu-san',
  },
  en: {
    nav: { profile: 'Profile', works: 'Projects', skills: 'Skills', career: 'Career', contact: 'Contact' },
    switchLabel: 'Language',
    switchText: '日本語',
    tech: 'Tech',
    present: 'present',
    footer: '© 2026 Izu-san',
  },
};
