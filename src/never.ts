/** Error for unexpected values. Carries value for inspection. */
export class NeverError extends TypeError {
  override name = "NeverError";
  readonly value: unknown;

  constructor(message: string, value: unknown, options?: ErrorOptions) {
    super(message, options);
    this.value = value;
  }
}

/**
 * Use in the default arm of a reducer as an exhaustiveness check.
 * Because `value` is of type `never`, Typescript will show an error if the
 * switch is not exhaustive.
 */
export const assertNever = (value: never): never => {
  throw new NeverError(`Unexpected value`, value);
};
