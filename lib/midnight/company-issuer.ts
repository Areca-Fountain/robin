'use client';

// Helpers for a company's Midnight "issuer key".
// The key is created in the browser and never sent to Robin. Only its hash
// (the issuerId) is shared, so Robin's admin can register the company on-chain.

import { fromHex, isHex32, toHex, type ChainAttributes } from './credential';
import { randomBytes32 } from '../../midnight/witnesses';

const storageKey = (companyId: string) => `robin-mn-issuer:${companyId}`;

export function getIssuerSecret(companyId: string): string | null {
  try {
    const v = localStorage.getItem(storageKey(companyId));
    return v && isHex32(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function saveIssuerSecret(companyId: string, secretHex: string) {
  try {
    localStorage.setItem(storageKey(companyId), secretHex.toLowerCase());
  } catch {
    throw new Error('Browser storage is blocked, so the issuer key cannot be saved here.');
  }
}

export function createIssuerSecret(): string {
  return toHex(randomBytes32());
}

async function loadContractModule(): Promise<any> {
  return import('../../midnight/managed/robin_private/contract/index.js');
}

/** The public id of an issuer key: the contract's own hash function, run locally. */
export async function issuerIdOf(secretHex: string): Promise<string> {
  const mod = await loadContractModule();
  return toHex(mod.pureCircuits.issuerIdOf(fromHex(secretHex)));
}

/** The commitment the contract will compute for these letter details. */
export async function commitmentOf(attrs: ChainAttributes, saltHex: string): Promise<string> {
  const mod = await loadContractModule();
  return toHex(mod.pureCircuits.commitmentOf(attrs, fromHex(saltHex)));
}

/** Accepts a company backup file, or the test-issuer file made on the admin page. */
export function parseIssuerBackup(text: string): string {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid issuer key file.');
  }
  const hex = String(json?.issuerSecret ?? '');
  if (!isHex32(hex)) throw new Error('The file has no valid issuerSecret (64 hex characters).');
  return hex.toLowerCase();
}

export function downloadText(fileName: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
