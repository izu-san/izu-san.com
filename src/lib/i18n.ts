export const languages = ['ja', 'en'] as const;
export type Lang = (typeof languages)[number];

export const paths: Record<Lang, string> = { ja: '/', en: '/en/' };
export const otherLang = (lang: Lang): Lang => (lang === 'ja' ? 'en' : 'ja');

// セクション ID は日英で共通にする。
export const sectionIds = ['profile', 'works', 'skills', 'career', 'contact'] as const;
export type SectionId = (typeof sectionIds)[number];

interface Ui {
  nav: Record<SectionId, string>;
  skip: string;
  navLabel: string;
  switchLabel: string;
  switchText: string;
  tech: string;
  status: { title: string; updated: string; kinds: Record<'running' | 'idle' | 'next', string> };
  token: { label: string };
  approval: { designed: string; checked: string; approved: string; you: string; open: string };
  present: string;
  footer: string;
}

// Record<Lang, Ui> により、片方の言語の欠落は型チェック（pnpm check）で失敗する。
export const ui: Record<Lang, Ui> = {
  ja: {
    nav: { profile: 'プロフィール', works: '個人開発', skills: 'スキル', career: '職歴', contact: '連絡・外部リンク' },
    skip: '本文へ移動',
    navLabel: 'セクション',
    switchLabel: '言語',
    switchText: 'English',
    tech: '使用技術',
    status: { title: '稼働状況', updated: '最終更新', kinds: { running: '稼働中', idle: '待機中', next: '次' } },
    token: { label: '次トークン候補' },
    approval: { designed: '設計', checked: '照査', approved: '承認', you: 'あなた', open: 'ご連絡で完了します' },
    present: '現在',
    footer: '© 2026 Izu-san',
  },
  en: {
    nav: { profile: 'Profile', works: 'Projects', skills: 'Skills', career: 'Career', contact: 'Contact' },
    skip: 'Skip to content',
    navLabel: 'Sections',
    switchLabel: 'Language',
    switchText: '日本語',
    tech: 'Tech',
    status: { title: 'Status', updated: 'Last updated', kinds: { running: 'NOW RUNNING', idle: 'IDLE', next: 'NEXT' } },
    token: { label: 'Next token' },
    approval: { designed: 'Designed by', checked: 'Checked by', approved: 'Approved by', you: 'You', open: 'Awaiting your message' },
    present: 'present',
    footer: '© 2026 Izu-san',
  },
};
