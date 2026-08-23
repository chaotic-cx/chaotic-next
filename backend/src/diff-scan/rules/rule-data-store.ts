export interface RuleDataStore {
  load(cacheKey: string): Promise<string | null>;
  save(cacheKey: string, raw: string): Promise<void>;
}

let store: RuleDataStore | null = null;

export function provideRuleDataStore(implementation: RuleDataStore | null): void {
  store = implementation;
}

export function ruleDataStore(): RuleDataStore | null {
  return store;
}
