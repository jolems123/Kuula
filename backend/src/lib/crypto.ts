/**
 * Argon2id wrappers for hashing passwords + PINs + OTP codes. Argon2id is the
 * OWASP-recommended password hash (memory-hard, side-channel resistant).
 */
import argon2 from "argon2";
import { config } from "../config.js";

const opts: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: config.auth.argon2.memoryKib,
  timeCost: config.auth.argon2.timeCost,
  parallelism: config.auth.argon2.parallelism,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, opts);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

/** Hash a short numeric PIN/OTP — same algorithm, smaller cost (still safe). */
export function hashPin(plain: string): Promise<string> {
  return argon2.hash(plain, { ...opts, timeCost: 1 });
}

export function verifyPin(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
