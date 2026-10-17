import type { FormattedFastfetchRow } from '../birthday-fastfetch';
import type { CommitQuote } from '../birthday-quotes';

export type TranslationParams = Record<string, unknown>;

export type LineTone = 'plain' | 'muted' | 'accent' | 'success' | 'error';

export interface CommandLine {
  kind: 'command';
  text: string;
}

export interface TextLine {
  kind: 'text';
  text: string;
  tone: LineTone;
}

export interface MessageLine {
  kind: 'message';
  key: string;
  params: TranslationParams;
  tone: LineTone;
}

export interface EntryLine {
  kind: 'entry';
  term: string;
  key: string;
}

export interface FactLine {
  kind: 'fact';
  row: FormattedFastfetchRow;
}

export interface CommitLine {
  kind: 'commit';
  quote: CommitQuote;
}

export interface ArtLine {
  kind: 'art';
  text: string;
  spokenText: string;
}

export type ShellLine = CommandLine | TextLine | MessageLine | EntryLine | FactLine | CommitLine | ArtLine;

export function textLine(text: string, tone: LineTone = 'plain'): TextLine {
  return { kind: 'text', text, tone };
}

export function messageLine(key: string, params: TranslationParams = {}, tone: LineTone = 'plain'): MessageLine {
  return { kind: 'message', key, params, tone };
}

export function artLine(text: string, spokenText = ''): ArtLine {
  return { kind: 'art', text, spokenText };
}
