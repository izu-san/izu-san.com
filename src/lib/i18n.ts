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
  factory: {
    summary: string;
    intro: string;
    noscript: string;
    boardLabel: string;
    run: string;
    reset: string;
    cell: string;
    dirs: string[];
    source: string;
    goal: string;
    wall: string;
    results: Record<'goal' | 'out' | 'wall' | 'gap' | 'loop', string>;
    clear: string;
  };
  approval: { designed: string; checked: string; approved: string; you: string; open: string; invite: string };
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
    factory: {
      summary: 'ミニ工場（遊べます）',
      intro: '入口（IN）から出口（OUT）まで素材を運んでください。マスを押すたびにベルトの向きが変わります（→ ↓ ← ↑ → なし）。',
      noscript: 'このパズルには JavaScript が必要です。連絡先は上のリンクからどうぞ。',
      boardLabel: 'ミニ工場の盤面',
      run: '起動',
      reset: 'リセット',
      cell: '{r} 行 {c} 列: {d}',
      dirs: ['ベルトなし', 'ベルト 右向き', 'ベルト 下向き', 'ベルト 左向き', 'ベルト 上向き'],
      source: '入口（素材が出ます）',
      goal: '出口（ここへ運びます）',
      wall: '壁',
      results: {
        goal: '出口に届きました。',
        out: '盤面の外へ落ちました。',
        wall: '壁にぶつかりました。',
        gap: 'ベルトが途切れています。',
        loop: 'ぐるぐる回っています。',
      },
      clear: '納品完了です。遊んでくれてありがとうございます。よければ連絡をください。',
    },
    approval: { designed: '設計', checked: '審査', approved: '承認', you: 'あなた', open: '未承認', invite: 'お気軽にご連絡ください' },
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
    factory: {
      summary: 'Mini factory (playable)',
      intro: 'Carry the material from the entrance (IN) to the exit (OUT). Each press on a cell turns its belt (→ ↓ ← ↑ → none).',
      noscript: 'This puzzle needs JavaScript. You can reach me through the links above.',
      boardLabel: 'Mini factory board',
      run: 'Start',
      reset: 'Reset',
      cell: 'Row {r}, column {c}: {d}',
      dirs: ['No belt', 'Belt pointing right', 'Belt pointing down', 'Belt pointing left', 'Belt pointing up'],
      source: 'Entrance (material comes out here)',
      goal: 'Exit (carry the material here)',
      wall: 'Wall',
      results: {
        goal: 'It reached the exit.',
        out: 'It fell off the board.',
        wall: 'It hit a wall.',
        gap: 'The belt is broken.',
        loop: 'It is going around in circles.',
      },
      clear: 'Delivered! Thanks for playing. Feel free to get in touch.',
    },
    approval: { designed: 'Designed by', checked: 'Checked by', approved: 'Approved by', you: 'You', open: 'Pending', invite: 'Feel free to get in touch' },
    present: 'present',
    footer: '© 2026 Izu-san',
  },
};
