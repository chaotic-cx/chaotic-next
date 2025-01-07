export interface TextEntity {
  type: string;
  text: string;
  href?: string;
}

export interface Reaction {
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
