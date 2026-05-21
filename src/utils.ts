/**
 * Use in the default arm of a reducer as an exhaustiveness check.
 * Because `value` is of type `never`, Typescript will show an error if the
 * switch is not exhaustive.
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unreachable case: ${JSON.stringify(value)}`);
};
