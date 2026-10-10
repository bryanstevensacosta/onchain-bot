/**
 * Etherscan V2 API shapes (dexter plan todo 32).
 *
 * V2 envelope is `{ status: '1'|'0', message: 'OK'|'NOTOK', result }`.
 * Keyless calls answer `status 0 / NOTOK / 'Missing/Invalid API Key'`
 * (pinned live 2026-10-09, evidence `.omo/evidence/task-fe-newprov.log`).
 */
export interface EtherscanV2Envelope<T> {
  readonly status?: string;
  readonly message?: string;
  readonly result?: T;
}

export interface EtherscanSourceCodeRow {
  readonly SourceCode?: string;
  readonly ABI?: string;
  readonly ContractName?: string;
}
