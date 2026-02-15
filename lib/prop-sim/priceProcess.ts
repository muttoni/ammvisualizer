export class GbmPriceProcess {
  private current: number

  private readonly driftTerm: number

  private readonly volTerm: number

  constructor(initialPrice: number, mu: number, sigma: number, dt: number) {
    this.current = initialPrice
    this.driftTerm = (mu - 0.5 * sigma * sigma) * dt
    this.volTerm = sigma * Math.sqrt(dt)
  }

  public currentPrice(): number {
    return this.current
  }

  public step(gaussianShock: number): number {
    this.current *= Math.exp(this.driftTerm + this.volTerm * gaussianShock)
    return this.current
  }
}
