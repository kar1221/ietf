import type { ICache } from './cache.js';

export class InMemoryCache<K, V> implements ICache<K, V> {
  private cache = new Map<K, V>();

  public set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  public get(key: K): V | undefined {
    return this.get(key);
  }

  public invalidate(key: K): boolean {
    return this.cache.delete(key);
  }
}
