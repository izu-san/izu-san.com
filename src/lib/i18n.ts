export const languages = ['ja', 'en'] as const;
export type Lang = (typeof languages)[number];

export const paths: Record<Lang, string> = { ja: '/', en: '/en/' };
/** 公開 URL のない作品の個別ページ（ZJS-20）。 */
export const workPath = (lang: Lang, id: string) => (lang === 'ja' ? `/works/${id}/` : `/en/works/${id}/`);
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
  work: { more: string; back: string; navLabel: string };
  status: { title: string; updated: string; kinds: Record<'running' | 'idle' | 'next', string> };
  token: { label: string };
  newTab: string;
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
    results: Record<'goal' | 'wrong' | 'short' | 'out' | 'wall' | 'gap' | 'loop', string>;
    clear: string;
    stageGroup: string;
    stage: string;
    stageCleared: string;
    order: string;
    sourceNote: string;
    machineNote: string;
    machine: string;
    sourceLabel: string;
    goalLabel: string;
    delivered: string;
    next: string;
    belts: string;
    best: string;
    newBest: string;
    storage: string;
    clearRecords: string;
    recordsCleared: string;
  };
  approval: { designed: string; checked: string; approved: string; you: string; open: string; invite: string };
  present: string;
  footer: string;
  analytics: { text: string; link: string };
  colophon: { built: string; fonts: string; source: string; sourceLink: string; buildDate: string };
  copy: { label: string; done: string; aria: string };
}

// Record<Lang, Ui> により、片方の言語の欠落は型チェック（pnpm check）で失敗する。
export const ui: Record<Lang, Ui> = {
  ja: {
    nav: { profile: 'プロフィール', works: '個人開発', skills: 'スキル', career: '職歴', contact: '連絡・外部リンク' },
    skip: '本文へ移動',
    navLabel: 'セクション',
    switchLabel: '言語',
    switchText: 'EN（English）',
    tech: '使用技術',
    work: { more: '詳しく見る', back: '個人開発に戻る', navLabel: '作品' },
    status: { title: '稼働状況', updated: '最終更新', kinds: { running: '稼働中', idle: '待機中', next: '次' } },
    token: { label: '次トークン候補' },
    newTab: '（新しいタブで開きます）',
    factory: {
      summary: 'ミニ工場（遊べます）',
      intro: 'ベルトの向きを変えて、入口の素材を出口（OUT）まで運んでください。マスを押すたびにベルトの向きが変わります（→ ↓ ← ↑ の順に変わり、最後はベルトなしに戻ります）。',
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
        goal: '出口に届きました。注文どおりです。',
        wrong: '出口に届きましたが、注文と素材が違います。',
        short: '組み立て機に、素材が足りません。2 つ入れてください。',
        out: '盤面の外へ落ちました。',
        wall: '壁か入口にぶつかりました。',
        gap: 'ベルトが途切れています。',
        loop: 'ぐるぐる回っています。',
      },
      clear: '全ステージ、納品完了です。遊んでくれてありがとうございます。よければ連絡をください。',
      stageGroup: 'ステージの選択',
      stage: 'ステージ {n}',
      stageCleared: 'クリア済み',
      order: '注文: {m} をそろえて、出口へ運ぶ',
      sourceNote: 'IN{k}: {m}',
      machineNote: 'MIX は組み立て機です。入ってきた素材を 2 つ合わせて、右へ送り出します。',
      machine: '組み立て機（素材を 2 つ合わせて、右へ送り出します）',
      sourceLabel: '入口 {k}（素材: {m}）',
      goalLabel: '出口（注文: {m}）',
      delivered: '納品した素材でできているのは、この作品です。',
      next: '次のステージへ',
      belts: 'ベルト {n} 本でクリア',
      best: '最少 {n} 本',
      newBest: '最少を更新しました。',
      storage: 'クリアの記録は、このブラウザーの中にだけ保存します。サーバーには送りません。',
      clearRecords: '記録を消す',
      recordsCleared: '記録を消しました。',
    },
    approval: { designed: '設計', checked: '審査', approved: '承認', you: 'あなた', open: '未承認', invite: 'お気軽にご連絡ください' },
    present: '現在',
    footer: '© 2026 Izu-san',
    colophon: {
      built: 'Astro で作り、AWS CDK で管理した S3 と CloudFront から配信しています。',
      fonts: '書体: Zen Kaku Gothic New、Dela Gothic One（SIL OFL 1.1）',
      source: 'ソースコード（MIT）',
      sourceLink: 'GitHub',
      buildDate: '最終ビルド',
    },
    analytics: {
      text: 'アクセス状況の把握に Cloudflare Web Analytics を使っています。Cookie は使わず、閲覧数・参照元・国・端末・URL だけを集計します。',
      link: 'Cloudflare Web Analytics について',
    },
    copy: { label: 'コピー', done: 'コピーしました', aria: 'メールアドレスをコピー' },
  },
  en: {
    nav: { profile: 'Profile', works: 'Projects', skills: 'Skills', career: 'Career', contact: 'Contact' },
    skip: 'Skip to content',
    navLabel: 'Sections',
    switchLabel: 'Language',
    switchText: 'JA（日本語）',
    tech: 'Tech',
    work: { more: 'Read more', back: 'Back to projects', navLabel: 'Project' },
    status: { title: 'Status', updated: 'Last updated', kinds: { running: 'NOW RUNNING', idle: 'IDLE', next: 'NEXT' } },
    token: { label: 'Next token' },
    newTab: '(opens in a new tab)',
    factory: {
      summary: 'Mini factory (playable)',
      intro: 'Turn the belts to carry the materials from the entrances to the exit (OUT). Each press changes the belt in the order → ↓ ← ↑, then back to no belt.',
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
        goal: 'It reached the exit. The order is complete.',
        wrong: 'It reached the exit, but the materials do not match the order.',
        short: 'The assembler needs two materials. Send in one more.',
        out: 'It fell off the board.',
        wall: 'It hit a wall or an entrance.',
        gap: 'The belt is broken.',
        loop: 'It is going around in circles.',
      },
      clear: 'All stages delivered! Thanks for playing. Feel free to get in touch.',
      stageGroup: 'Choose a stage',
      stage: 'Stage {n}',
      stageCleared: 'cleared',
      order: 'Order: bring {m} together to the exit',
      sourceNote: 'IN{k}: {m}',
      machineNote: 'MIX is an assembler. It joins two incoming materials and sends them out to the right.',
      machine: 'Assembler (joins two materials and sends them out to the right)',
      sourceLabel: 'Entrance {k} (material: {m})',
      goalLabel: 'Exit (order: {m})',
      delivered: 'These materials make up this project.',
      next: 'Next stage',
      belts: 'Cleared with {n} belts',
      best: 'Best: {n} belts',
      newBest: 'New best.',
      storage: 'Your clear records are saved only in this browser. Nothing is sent to a server.',
      clearRecords: 'Clear records',
      recordsCleared: 'Records cleared.',
    },
    approval: { designed: 'Designed by', checked: 'Checked by', approved: 'Approved by', you: 'You', open: 'Pending', invite: 'Feel free to get in touch' },
    present: 'present',
    footer: '© 2026 Izu-san',
    colophon: {
      built: 'Built with Astro and served from S3 and CloudFront, managed with AWS CDK.',
      fonts: 'Typefaces: Zen Kaku Gothic New, Dela Gothic One (SIL OFL 1.1)',
      source: 'Source code (MIT)',
      sourceLink: 'GitHub',
      buildDate: 'Last build',
    },
    analytics: {
      text: 'This site uses Cloudflare Web Analytics to understand traffic. It sets no cookies and counts only page views, referrers, countries, devices and URLs. ',
      link: 'About Cloudflare Web Analytics',
    },
    copy: { label: 'Copy', done: 'Copied', aria: 'Copy the email address' },
  },
};
