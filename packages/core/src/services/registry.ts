import { RegistryError } from '../errors/index.js';
import type { DependencyType } from './dependency-type.js';

/** A function that builds the value (can be async) */
export type Provider<T = unknown> = () => T | Promise<T>;

export class Registry {
  private providers = new Map<DependencyType, Provider>();

  /** Register either a factory or an already-constructed instance */
  register<T>(token: DependencyType, value: Provider<T> | T): this {
    const provider = typeof value === 'function' ? (value as Provider<T>) : () => value;
    this.providers.set(token, provider);
    return this;
  }

  /** Resolve (and memoise) a value */
  async resolve<T>(token: DependencyType): Promise<T> {
    const provider = this.providers.get(token);
    if (!provider) throw new RegistryError(`No provider for ${token}`, token);
    // Call once, memoise result so the provider is only executed the first time
    const result = await provider();
    this.providers.set(token, () => result);
    return result as T;
  }

  /** Shallow-merge another registry (useful for overrides) */
  merge(other: Registry): this {
    other.providers.forEach((v, k) => this.providers.set(k, v));
    return this;
  }
}
