export interface CacheOptions {
  ttlMs?: number;
}

export interface ICache<K, V> {
  set(key: K, value: V, opts?: CacheOptions): void;
  get(key: K): V | undefined;
  invalidate(key: K): boolean;
}
