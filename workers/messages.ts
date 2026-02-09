import type {
  CustomCompileResult,
  SimulationConfig,
  StrategyLibraryItem,
  StrategyRef,
  WorkerUiState,
} from '../lib/sim/types'

export type CompileStatusPhase = 'idle' | 'loading_runtime' | 'compiling' | 'completed' | 'error'

export interface CompileStatus {
  phase: CompileStatusPhase
}

export type WorkerInboundMessage =
  | {
      type: 'INIT_SIM'
      payload?: {
        config?: SimulationConfig
      }
    }
  | {
      type: 'STEP_ONE'
    }
  | {
      type: 'PLAY'
    }
  | {
      type: 'PAUSE'
    }
  | {
      type: 'RESET'
    }
  | {
      type: 'SET_STRATEGY'
      payload: {
        strategyRef: StrategyRef
      }
    }
  | {
      type: 'SET_CONFIG'
      payload: {
        config: Partial<SimulationConfig>
      }
    }
  | {
      type: 'COMPILE_CUSTOM'
      payload: {
        source: string
        nameHint?: string
      }
    }
  | {
      type: 'COMPILE_AND_ACTIVATE_CUSTOM'
      payload: {
        id?: string
        name: string
        source: string
      }
    }
  | {
      type: 'SAVE_CUSTOM'
      payload: {
        id?: string
        name: string
        source: string
      }
    }
  | {
      type: 'DELETE_CUSTOM'
      payload: {
        id: string
      }
    }
  | {
      type: 'LOAD_LIBRARY'
    }

export type WorkerOutboundMessage =
  | {
      type: 'STATE'
      payload: {
        state: WorkerUiState
      }
    }
  | {
      type: 'COMPILE_STATUS'
      payload: {
        status: CompileStatus
      }
    }
  | {
      type: 'COMPILE_RESULT'
      payload: {
        result: CustomCompileResult
      }
    }
  | {
      type: 'LIBRARY'
      payload: {
        items: StrategyLibraryItem[]
      }
    }
  | {
      type: 'ERROR'
      payload: {
        message: string
      }
    }
