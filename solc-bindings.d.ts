declare module 'solc/bindings' {
  interface SolcBindingsResult {
    coreBindings: {
      version: () => string
    }
    compileBindings: {
      compileStandard: (
        input: string,
        callbacks?: {
          import?: (path: string) => { contents?: string; error?: string }
          smtSolver?: (query: string) => { contents?: string; error?: string }
        },
      ) => string
    }
  }

  const setupBindings: (soljson: Record<string, unknown>) => SolcBindingsResult
  export default setupBindings
}
