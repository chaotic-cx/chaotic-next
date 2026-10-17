import { marker } from '@jsverse/transloco-keys-manager/marker';
import { BIRTHDAY_AGE, TIMELINE } from '../birthday.config';
import { FASTFETCH_ROWS, type FastfetchRow, formatFastfetchRows, MIRRORS_ROW, UPTIME_ROW } from '../birthday-fastfetch';
import { COMMIT_QUOTES } from '../birthday-quotes';
import { cakeArt, cowsayArt } from './shell-art';
import { artLine, messageLine, type ShellLine, textLine, type TranslationParams } from './shell-line';

export interface ShellContext {
  args: string[];
  history: readonly string[];
  language: string;
  translate: (key: string, params?: TranslationParams) => string;
}

export interface ShellResult {
  lines: ShellLine[];
  clearScreen: boolean;
  confetti: boolean;
}

interface ShellCommand {
  name: string;
  usage: string;
  descriptionKey: string;
  run: (context: ShellContext) => ShellResult;
}

interface EasterEgg {
  name: string;
  run: (context: ShellContext) => ShellResult;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'medium' };

const PACMAN_REPOS = ['core', 'extra', 'multilib', 'chaotic-aur'];

const PACMAN_PROGRESS_BAR = '[######################] 100%';

const PACMAN_REPO_COLUMN_WIDTH = 14;

function output(lines: ShellLine[]): ShellResult {
  return { lines, clearScreen: false, confetti: false };
}

function helpLines(): ShellLine[] {
  const lines: ShellLine[] = [messageLine(marker('memorial.edition2026.shell.help.intro'), {}, 'muted')];
  for (const command of SHELL_COMMANDS) {
    lines.push({ kind: 'entry', term: command.usage, key: command.descriptionKey });
  }

  lines.push(messageLine(marker('memorial.edition2026.shell.help.footer'), {}, 'muted'));

  return lines;
}

function historyLines(history: readonly string[]): ShellLine[] {
  const lines: ShellLine[] = [];
  for (const [index, entry] of history.entries()) {
    const number = String(index + 1).padStart(4);
    lines.push(textLine(`${number}  ${entry}`));
  }

  return lines;
}

function factLines(context: ShellContext, rows: FastfetchRow[]): ShellLine[] {
  const lines: ShellLine[] = [];
  for (const row of formatFastfetchRows(rows, context.language)) {
    lines.push({ kind: 'fact', row });
  }

  return lines;
}

function timelineLines(): ShellLine[] {
  const lines: ShellLine[] = [];
  for (const entry of TIMELINE) {
    lines.push({ kind: 'entry', term: entry.date, key: entry.textKey });
  }

  return lines;
}

function commitLines(): ShellLine[] {
  const lines: ShellLine[] = [];
  for (const quote of COMMIT_QUOTES) {
    lines.push({ kind: 'commit', quote });
  }

  return lines;
}

function pacmanLines(): ShellLine[] {
  const lines: ShellLine[] = [textLine(':: Synchronizing package databases...', 'accent')];
  for (const repo of PACMAN_REPOS) {
    lines.push(textLine(` ${repo.padEnd(PACMAN_REPO_COLUMN_WIDTH)}${PACMAN_PROGRESS_BAR}`));
  }

  lines.push(textLine(':: Starting full system upgrade...', 'accent'));
  lines.push(messageLine(marker('memorial.edition2026.shell.output.pacmanDone'), {}, 'success'));

  return lines;
}

function runGit(context: ShellContext): ShellResult {
  if (context.args[0] === 'log') return output(commitLines());

  return output([messageLine(marker('memorial.edition2026.shell.output.gitUsage'), {}, 'muted')]);
}

function runMake(context: ShellContext): ShellResult {
  const target = context.args[0];
  if (target === 'cake') {
    const lines = [
      artLine(cakeArt(BIRTHDAY_AGE)),
      messageLine(marker('memorial.edition2026.shell.output.cake'), { age: BIRTHDAY_AGE }, 'accent'),
    ];
    return { lines, clearScreen: false, confetti: true };
  }

  if (!target) return output([textLine('make: *** No targets specified and no makefile found.  Stop.', 'error')]);

  return output([textLine(`make: *** No rule to make target '${target}'.  Stop.`, 'error')]);
}

function runPacman(context: ShellContext): ShellResult {
  if (context.args.includes('-Syu')) return output(pacmanLines());

  return output([textLine('error: no operation specified (use -h for help)', 'error')]);
}

function runRm(context: ShellContext): ShellResult {
  if (context.args.length === 0) return output([textLine('rm: missing operand', 'error')]);

  return output([messageLine(marker('memorial.edition2026.shell.output.rmDenied'), {}, 'error')]);
}

function runCowsay(context: ShellContext): ShellResult {
  let text = context.args.join(' ');
  if (text === '') {
    text = context.translate(marker('memorial.edition2026.shell.output.cowsayDefault'), { age: BIRTHDAY_AGE });
  }

  return output([artLine(cowsayArt(text), text)]);
}

function runDate(context: ShellContext): ShellResult {
  const date = new Intl.DateTimeFormat(context.language, DATE_FORMAT).format(new Date());
  return output([textLine(date)]);
}

function runMirrors(context: ShellContext): ShellResult {
  const lines = factLines(context, [MIRRORS_ROW]);
  lines.push(messageLine(marker('memorial.edition2026.shell.output.mirrorsMap'), {}, 'muted'));

  return output(lines);
}

const SHELL_COMMANDS: ShellCommand[] = [
  {
    name: 'help',
    usage: 'help',
    descriptionKey: marker('memorial.edition2026.shell.commands.help'),
    run: () => output(helpLines()),
  },
  {
    name: 'clear',
    usage: 'clear',
    descriptionKey: marker('memorial.edition2026.shell.commands.clear'),
    run: () => ({ lines: [], clearScreen: true, confetti: false }),
  },
  {
    name: 'fastfetch',
    usage: 'fastfetch',
    descriptionKey: marker('memorial.edition2026.shell.commands.fastfetch'),
    run: (context) => output(factLines(context, FASTFETCH_ROWS)),
  },
  {
    name: 'journalctl',
    usage: 'journalctl',
    descriptionKey: marker('memorial.edition2026.shell.commands.journalctl'),
    run: () => output(timelineLines()),
  },
  {
    name: 'git',
    usage: 'git log',
    descriptionKey: marker('memorial.edition2026.shell.commands.gitLog'),
    run: runGit,
  },
  {
    name: 'mirrors',
    usage: 'mirrors',
    descriptionKey: marker('memorial.edition2026.shell.commands.mirrors'),
    run: runMirrors,
  },
  {
    name: 'uptime',
    usage: 'uptime',
    descriptionKey: marker('memorial.edition2026.shell.commands.uptime'),
    run: (context) => output(factLines(context, [UPTIME_ROW])),
  },
  {
    name: 'make',
    usage: 'make cake',
    descriptionKey: marker('memorial.edition2026.shell.commands.makeCake'),
    run: runMake,
  },
  {
    name: 'pacman',
    usage: 'pacman -Syu',
    descriptionKey: marker('memorial.edition2026.shell.commands.pacman'),
    run: runPacman,
  },
  {
    name: 'cowsay',
    usage: 'cowsay [text]',
    descriptionKey: marker('memorial.edition2026.shell.commands.cowsay'),
    run: runCowsay,
  },
  {
    name: 'sudo',
    usage: 'sudo [command]',
    descriptionKey: marker('memorial.edition2026.shell.commands.sudo'),
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.sudoDenied'), {}, 'error')]),
  },
  {
    name: 'rm',
    usage: 'rm -rf /',
    descriptionKey: marker('memorial.edition2026.shell.commands.rm'),
    run: runRm,
  },
  {
    name: 'whoami',
    usage: 'whoami',
    descriptionKey: marker('memorial.edition2026.shell.commands.whoami'),
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.whoami'))]),
  },
  {
    name: 'date',
    usage: 'date',
    descriptionKey: marker('memorial.edition2026.shell.commands.date'),
    run: runDate,
  },
  {
    name: 'echo',
    usage: 'echo [text]',
    descriptionKey: marker('memorial.edition2026.shell.commands.echo'),
    run: (context) => output([textLine(context.args.join(' '))]),
  },
  {
    name: 'history',
    usage: 'history',
    descriptionKey: marker('memorial.edition2026.shell.commands.history'),
    run: (context) => output(historyLines(context.history)),
  },
  {
    name: 'exit',
    usage: 'exit',
    descriptionKey: marker('memorial.edition2026.shell.commands.exit'),
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.exit'), {}, 'accent')]),
  },
];

function aurHelper(name: string): EasterEgg {
  return {
    name,
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.aurHelper'), { helper: name })]),
  };
}

const EASTER_EGGS: EasterEgg[] = [
  aurHelper('yay'),
  aurHelper('paru'),
  {
    name: 'vim',
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.vim'))]),
  },
  {
    name: ':q',
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.quitVim'))]),
  },
  {
    name: 'neofetch',
    run: () => output([messageLine(marker('memorial.edition2026.shell.output.neofetch'), { command: 'fastfetch' })]),
  },
];

const COMMANDS_BY_NAME = new Map<string, (context: ShellContext) => ShellResult>();
for (const command of [...SHELL_COMMANDS, ...EASTER_EGGS]) {
  COMMANDS_BY_NAME.set(command.name, command.run);
}

export function runCommand(input: string, context: Omit<ShellContext, 'args'>): ShellResult {
  const [name = '', ...args] = input.trim().split(/\s+/);
  const run = COMMANDS_BY_NAME.get(name);
  if (!run) {
    return output([messageLine(marker('memorial.edition2026.shell.output.notFound'), { command: name }, 'error')]);
  }

  return run({ ...context, args });
}

/**
 * The names of the commands in the help list that start with `prefix`. Easter eggs stay hidden.
 */
export function completeCommand(prefix: string): string[] {
  const matches: string[] = [];
  for (const command of SHELL_COMMANDS) {
    if (command.name.startsWith(prefix)) {
      matches.push(command.name);
    }
  }

  return matches;
}

export function konamiLines(): ShellLine[] {
  return [messageLine(marker('memorial.edition2026.shell.output.konami'), {}, 'accent')];
}

export function welcomeLines(): ShellLine[] {
  return [
    messageLine(marker('memorial.edition2026.shell.output.welcome'), { age: BIRTHDAY_AGE }, 'accent'),
    messageLine(marker('memorial.edition2026.shell.output.hint'), { command: 'help' }, 'muted'),
  ];
}
