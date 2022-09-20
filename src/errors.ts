/**
 * General error thrown by TgaLoader class
 */
export class TgaLoaderError extends Error {
  /**
   * Construct an error message with details
   * @param msg Error details
   */
  constructor(msg: string) {
    super(`Failed loading TGA: "${msg}"`);
  }
}

/**
 * Error thrown by TgaLoader class when its load method is required but has not been called.
 */
export class TgaLoaderReferenceError extends ReferenceError {
  /**
   * Construct an error message with details regarding the uninitialized TGA
   * @param msg Error details
   */
  constructor(msg: string) {
    super(`TGA file data has not been initialized. ${msg}`.trim());
  }
}
