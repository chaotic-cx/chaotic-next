export type TextEntityType =
  | 'bold'
  | 'bot_command'
  | 'cashtag'
  | 'code'
  | 'custom_emoji'
  | 'email'
  | 'hashtag'
  | 'italic'
  | 'mention'
  | 'phone_number'
  | 'pre'
  | 'spoiler'
  | 'strikethrough'
  | 'text_link'
  | 'underline'
  | 'url';

export interface TextEntity {
  type: TextEntityType;
  text: string;
  href?: string;
}

interface Reaction {
  type: string;
  count: number;
  emoji: string;
}

export interface Message {
  id: number;
  type: string;
  date: string;
  date_unixtime: string;
  edited: string;
  edited_unixtime: string;
  from: string;
  from_id: string;
  author: string;
  text: (string | TextEntity)[] | string;
  text_entities: TextEntity[];
  reactions: Reaction[];
}
