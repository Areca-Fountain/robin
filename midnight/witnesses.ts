export interface RobinPrivateState {
  issuerSecret: Uint8Array;
  employeeNameHash: Uint8Array;
  nicHash: Uint8Array;
  positionHash: Uint8Array;
  startDay: bigint;
  endDay: bigint;
  salt: Uint8Array;
}

export function createEmptyPrivateState(): RobinPrivateState {
  return {
    issuerSecret: new Uint8Array(32),
    employeeNameHash: new Uint8Array(32),
    nicHash: new Uint8Array(32),
    positionHash: new Uint8Array(32),
    startDay: 0n,
    endDay: 0n,
    salt: new Uint8Array(32),
  };
}

type WitnessCtx = { privateState: RobinPrivateState };

export const witnesses = {
  issuerSecret({ privateState }: WitnessCtx): [RobinPrivateState, Uint8Array] {
    return [privateState, privateState.issuerSecret];
  },
  employeeNameHash({ privateState }: WitnessCtx): [RobinPrivateState, Uint8Array] {
    return [privateState, privateState.employeeNameHash];
  },
  nicHash({ privateState }: WitnessCtx): [RobinPrivateState, Uint8Array] {
    return [privateState, privateState.nicHash];
  },
  positionHash({ privateState }: WitnessCtx): [RobinPrivateState, Uint8Array] {
    return [privateState, privateState.positionHash];
  },
  startDay({ privateState }: WitnessCtx): [RobinPrivateState, bigint] {
    return [privateState, privateState.startDay];
  },
  endDay({ privateState }: WitnessCtx): [RobinPrivateState, bigint] {
    return [privateState, privateState.endDay];
  },
  salt({ privateState }: WitnessCtx): [RobinPrivateState, Uint8Array] {
    return [privateState, privateState.salt];
  },
};
