declare module 'solc' {
  interface SolcModule {
    compile(input: string): string
    version(): string
  }

  const solc: SolcModule
  export default solc
}
