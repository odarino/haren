/** An error that ends the CLI with a chosen exit code. Exit 3 means "needs the user", not a failure. */
export class ExitCode extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "ExitCode";
  }
}
