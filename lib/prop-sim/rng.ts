import { SeededRng } from '../sim/utils'

export class PropRng {
  private readonly rng: SeededRng

  constructor(seed: number) {
    this.rng = new SeededRng(seed)
  }

  public reset(seed: number): void {
    this.rng.reset(seed)
  }

  public next(): number {
    return this.rng.next()
  }

  public between(min: number, max: number): number {
    return this.rng.between(min, max)
  }

  public gaussian(): number {
    return this.rng.gaussian()
  }
}
