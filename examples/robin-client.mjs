// A small Node.js (18+) client for the Robin API. Copy this file into your own project.
// Reading, listing and verifying need no extra packages.
// Issuing and revoking sign a Cardano transaction, so they also need:  npm i @meshsdk/core
//
//   import { RobinClient, meshWallet } from "./robin-client.mjs";
//   const robin = new RobinClient({ url: "https://YOUR-ROBIN-DOMAIN", key: process.env.ROBIN_KEY });
//   console.log(await robin.me());

export class RobinError extends Error {
  constructor(status, code, message) {
    super(`${message} (${code}, HTTP ${status})`);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RobinClient {
  /** @param {{ url: string, key: string }} opts */
  constructor({ url, key }) {
    if (!url) throw new Error("RobinClient needs the Robin url.");
    if (!key || !key.startsWith("rbn_")) throw new Error("RobinClient needs an API key that starts with rbn_.");
    this.url = url.replace(/\/+$/, "");
    this.key = key;
  }

  /** Low level call. Returns { status, json }. Waits and retries once if rate limited. */
  async raw(method, path, body, retried = false) {
    const res = await fetch(this.url + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429 && !retried) {
      await sleep((Number(res.headers.get("retry-after")) || 10) * 1000);
      return this.raw(method, path, body, true);
    }
    return { status: res.status, json };
  }

  /** Like raw(), but throws RobinError for 4xx and 5xx */
  async call(method, path, body) {
    const { status, json } = await this.raw(method, path, body);
    if (status >= 400) {
      const e = json?.error ?? {};
      throw new RobinError(status, e.code ?? "unknown", e.message ?? "Request failed.");
    }
    return { status, json };
  }

  me() { return this.call("GET", "/api/v1/me").then((r) => r.json); }
  formats() { return this.call("GET", "/api/v1/formats").then((r) => r.json); }
  getLetter(id) { return this.call("GET", `/api/v1/letters/${id}`).then((r) => r.json); }
  verify(input) { return this.call("POST", "/api/v1/verify", input).then((r) => r.json); }

  /** @param {{ limit?: number, page?: number, status?: "active" | "revoked" }} [q] */
  listLetters(q = {}) {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    const qs = s.toString();
    return this.call("GET", `/api/v1/letters${qs ? `?${qs}` : ""}`).then((r) => r.json);
  }

  /** Waits until Robin answers 200. Cardano can take a minute to show a transaction. */
  async #confirm(path, txHash, tries = 36) {
    for (let i = 0; i < tries; i++) {
      const { status, json } = await this.call("POST", path, { txHash });
      if (status === 200) return json;
      await sleep(5000); // 202: Cardano has not shown it yet
    }
    throw new Error("Cardano did not confirm in time. Call the confirm endpoint again later with the same txHash.");
  }

  /**
   * Issues a letter end to end (prepare, sign, submit, confirm).
   * @param input  { formatId, employeeName, position?, nic?, startDate, endDate?, stillEmployed?, letterheadId? }
   * @param wallet a Mesh wallet, see meshWallet() below
   * @returns { letter, pdf (Buffer), txHash }  Keep the pdf: its bytes are what the blockchain proves.
   */
  async issueLetter(input, wallet) {
    const changeAddress = await wallet.getChangeAddress();
    const { json: prepared } = await this.call("POST", "/api/v1/letters", { ...input, changeAddress });
    const signed = await wallet.signTx(prepared.unsignedTx);
    const txHash = await wallet.submitTx(signed);
    const confirmed = await this.#confirm(`/api/v1/letters/${prepared.letterId}/confirm`, txHash);
    return { letter: confirmed.letter, pdf: Buffer.from(prepared.pdfBase64, "base64"), txHash };
  }

  /** Revokes a letter end to end. Revoking is public and cannot be undone. */
  async revokeLetter(letterId, wallet) {
    const changeAddress = await wallet.getChangeAddress();
    const { json: prepared } = await this.call("POST", `/api/v1/letters/${letterId}/revoke`, { changeAddress });
    const signed = await wallet.signTx(prepared.unsignedTx, true); // true = partial signing
    const txHash = await wallet.submitTx(signed);
    return this.#confirm(`/api/v1/letters/${letterId}/revoke/confirm`, txHash);
  }
}

/**
 * Opens the company wallet from its 24 words, on Cardano Preprod.
 * Needs:  npm i @meshsdk/core
 * Use the wallet you registered with Robin. Keep the words in an environment variable or a secrets manager.
 */
export async function meshWallet({ blockfrostKey, mnemonic }) {
  const { BlockfrostProvider, MeshWallet } = await import("@meshsdk/core");
  const provider = new BlockfrostProvider(blockfrostKey);
  const wallet = new MeshWallet({
    networkId: 0, // Preprod
    fetcher: provider,
    submitter: provider,
    key: { type: "mnemonic", words: mnemonic.trim().split(/\s+/) },
  });
  await wallet.init?.(); // needed in newer Mesh versions, ignored in older ones
  return wallet;
}
