import { Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * OWASP baseline for Argon2id: 19 MiB, 2 iterations, 1 lane. The algorithm is
 * omitted on purpose: the binding's default (and the Rust crate default) is
 * Argon2id, and `Algorithm` is an ambient const enum that `isolatedModules`
 * cannot read as a value.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  #decoyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return argonHash(password, ARGON_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argonVerify(hash, password, ARGON_OPTIONS);
    } catch {
      return false;
    }
  }

  /**
   * Verifies against a throwaway hash so an unknown email costs the same as a
   * wrong password (no account enumeration through response timing).
   */
  async verifyDecoy(password: string): Promise<boolean> {
    this.#decoyHash ??= argonHash('peertoreel-decoy-password', ARGON_OPTIONS);
    await this.verify(await this.#decoyHash, password);
    return false;
  }
}
