export interface CommitQuote {
  hash: string;
  repo: string;
  date: string;
  author: string;
  message: string;
}

type QuoteRow = [hash: string, repo: string, date: string, author: string, message: string];

const QUOTE_ROWS: QuoteRow[] = [
  ['f18e025', 'infra', '2018-11-08', 'PedroHLC', 'Another one bites the dust'],
  ['f20b6c7', 'infra', '2018-11-08', 'PedroHLC', 'Reinvent wheel in KISS'],
  ['58e47ff', 'infra', '2018-11-09', 'PedroHLC', 'The Winner Takes It All'],
  ['9a50bde', 'infra', '2018-11-09', 'PedroHLC', "Look What You've Done"],
  ['fc51496', 'infra', '2018-11-21', 'PedroHLC', 'I Wish'],
  ['91f7507', 'infra', '2018-12-15', 'PedroHLC', 'Week-long problems'],
  [
    'cf9a47f',
    'infra',
    '2020-03-07',
    'PedroHLC',
    'Commit these CGI before I delete them, so I revert in case I need again',
  ],
  ['107082e', 'infra', '2020-03-07', 'PedroHLC', "Delete CGI-BIN scripts, wasn't that good ideia!"],
  ['22797cd', 'infra', '2020-07-26', 'PedroHLC', 'Last commit and the death of infra1.0'],
  ['7eb69ef', 'toolbox', '2020-07-27', 'PedroHLC', "Just now remembered why this wasn't working yesterday"],
  ['beebed4', 'infra', '2020-10-20', 'PedroHLC', 'This never dies'],
  ['013cb6b', 'toolbox', '2020-12-14', 'PedroHLC', 'Do a crime for clean env'],
  ['4f91c8f', 'toolbox', '2020-12-29', 'Paulo Matias', 'Never mix spaces and tabs'],
  [
    '08a1512',
    'interfere',
    '2021-01-18',
    'PedroHLC',
    'And there are some many shell layers that we have to escape stuff',
  ],
  ['61ff933', 'toolbox', '2021-03-17', 'PedroHLC', 'No clue why I did this mistake'],
  ['8544137', 'toolbox', '2021-03-17', 'PedroHLC', 'Now I remembered why I made that'],
  ['84ebf3a', 'router', '2021-03-29', 'PedroHLC', 'Kill the Singapore one'],
  ['f2f90f4', 'toolbox', '2021-05-06', 'PedroHLC', 'I forgot those and broke production'],
  ['1427fde', 'router', '2021-06-05', 'PedroHLC', 'YEAHH'],
  ['9584bd2', 'router', '2021-08-06', 'PedroHLC', 'Move from PH to KR (oops)'],
  ['bceaeee', 'interfere', '2021-08-21', 'dr460nf1r3', 'Once again adapt to linux-cacule changes, prt3'],
  ['0840eeb', 'toolbox', '2021-11-08', 'PedroHLC', 'Newer futex for more fun....'],
  ['c2c9641', 'toolbox', '2021-11-09', 'Paulo Matias', 'what?! how come this was working at all?'],
  ['9079d3f', 'toolbox', '2021-11-23', 'Paulo Matias', "@pedrohlc didn't use sane wait, he prefers insane wait"],
  ['ccc3152', 'toolbox', '2022-01-17', 'dr460nf1r3', '5.16 time!'],
  ['ec77ad6', 'toolbox', '2022-01-19', 'PedroHLC', 'Kill, already dead, schedulers'],
  ['761cc55', 'interfere', '2022-05-25', 'Alexandre Pereira', "depends-= doesn't work???"],
  ['ad45344', 'chaotic-aur.github.io', '2022-07-30', 'Nico', 'Fix my lazy copy paste error (#23)'],
  [
    '50447b5',
    'chaotic-aur-ansible',
    '2022-07-30',
    'dr460nf1r3',
    'Fix CAUR_FILL_DEST defaulting to repo.garudalinux.org resulting in sweating Temeraira',
  ],
  ['e3ad038', 'toolbox', '2022-10-05', 'Nico', '6.0 time! ❤ (#64)'],
  [
    '097a91a',
    'interfere',
    '2022-12-16',
    'Alexandre Pereira',
    'Finally... after many years and several lives... a proper fix!',
  ],
  ['f5d3c3a', 'interfere', '2022-12-22', 'dr460nf1r3', 'Lets give renaming another try'],
  ['874871c', 'toolbox', '2023-02-20', 'Nico', 'Bring 6.2 to the party 🤞🏻 (#73)'],
  ['c9f8574', 'toolbox', '2023-05-12', 'Nico', 'We are late to the kernel party.. (#78)'],
  ['cd5c604', 'nyx', '2023-07-11', 'PedroHLC', 'firedragon looks dead inside'],
  ['8aa9dd7', 'chaotic-next', '2024-06-07', 'Nico Jensch', 'g'],
  [
    '692acf8',
    'router-ts',
    '2026-05-02',
    'Nico Jensch',
    "feat: migrate to fly.io and pnpm because I couldn't be bothered with the super weird way of deploying yarn berry to Dockerfiles, gosh",
  ],
];

function toQuote(row: QuoteRow): CommitQuote {
  const [hash, repo, date, author, message] = row;
  return { hash, repo, date, author, message };
}

export const COMMIT_QUOTES: CommitQuote[] = QUOTE_ROWS.map(toQuote);
