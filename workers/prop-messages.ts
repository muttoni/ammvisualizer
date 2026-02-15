import type { PropSimulationConfig, PropWorkerUiState } from '../lib/prop-sim/types'

export type PropWorkerInboundMessage =
  | {
      type: 'INIT_PROP_SIM'
      payload?: {
        config?: Partial<PropSimulationConfig>
      }
    }
  | {
      type: 'SET_PROP_CONFIG'
      payload: {
        config: Partial<PropSimulationConfig>
      }
    }
  | {
      type: 'STEP_PROP_ONE'
    }
  | {
      type: 'PLAY_PROP'
    }
  | {
      type: 'PAUSE_PROP'
    }
  | {
      type: 'RESET_PROP'
    }

export type PropWorkerOutboundMessage =
  | {
      type: 'PROP_STATE'
      payload: {
        state: PropWorkerUiState
      }
    }
  | {
      type: 'PROP_ERROR'
      payload: {
        message: string
      }
    }
