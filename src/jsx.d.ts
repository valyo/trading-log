/**
 * Fallback JSX types when @types/react is not resolved (e.g. IDE before npm install).
 * Ensures "JSX element implicitly has type 'any'" is resolved. Remove this file if
 * the project has node_modules/@types/react and the error is gone.
 */
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}
