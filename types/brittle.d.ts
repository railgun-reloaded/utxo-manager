declare module 'brittle' {
  export interface Test {
    ok(value: any, message?: string): void;
    is<T>(actual: T, expected: T, message?: string): void;
    not<T>(actual: T, expected: T, message?: string): void;
    pass(message?: string): void;
    fail(message?: string): void;
    plan(count: number): void;
    teardown(fn: () => void | Promise<void>): void;
    comment(message: string): void;
  }

  type TestFunction = (t: Test) => void | Promise<void>;

  function test(name: string, fn: TestFunction): void;

  export default test;
}
