/**
 * Animation Presets
 *
 * Phase 1.1: Convenience constants for common animation patterns
 * Provides pre-configured animation settings for typical use cases
 */

import type { LinkAnimation, NodeModel } from '@grafloria/engine';

/**
 * Preset configurations for common workflow states
 */
export const AnimationPresets = {
  /**
   * Workflow & Process States
   */
  WORKFLOW: {
    /** Active workflow step with running animation */
    RUNNING: {
      node: {
        status: 'running' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'pulse' as const,
          borderAnimationSpeed: 1.5,
        }
      },
      link: {
        type: 'flow' as const,
        speed: 'normal' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },

    /** Processing with data flow */
    PROCESSING: {
      node: {
        status: 'running' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'gradient' as const,
          borderAnimationSpeed: 2,
          borderAnimationColors: ['#667eea', '#764ba2']
        }
      },
      link: {
        type: 'dash-flow' as const,
        speed: 'fast' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },

    /** Completed step with success state */
    COMPLETED: {
      node: {
        status: 'completed' as const,
        animateStatus: true,
        style: {
          animatedBorder: false,
        }
      },
      link: {
        type: 'none' as const,
      } as LinkAnimation
    },

    /** Error state with alert animation */
    ERROR: {
      node: {
        status: 'error' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'pulse' as const,
          borderAnimationSpeed: 2,
          borderAnimationColors: ['#e74c3c', '#c0392b']
        }
      },
      link: {
        type: 'none' as const,
      } as LinkAnimation
    },

    /** Warning state with attention animation */
    WARNING: {
      node: {
        status: 'warning' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'breathe' as const,
          borderAnimationSpeed: 1.5,
          borderAnimationColors: ['#f39c12', '#e67e22']
        }
      },
      link: {
        type: 'none' as const,
      } as LinkAnimation
    },

    /** Pending/waiting state */
    PENDING: {
      node: {
        status: 'pending' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'shimmer' as const,
          borderAnimationSpeed: 1,
        }
      },
      link: {
        type: 'none' as const,
      } as LinkAnimation
    },
  },

  /**
   * Data Flow Patterns
   */
  DATA_FLOW: {
    /** Active data transfer */
    ACTIVE: {
      type: 'flow' as const,
      speed: 'normal' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** High-speed data stream */
    STREAMING: {
      type: 'flow' as const,
      speed: 'fast' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** Slow/throttled data flow */
    THROTTLED: {
      type: 'dash-flow' as const,
      speed: 'slow' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** Bidirectional data exchange */
    BIDIRECTIONAL: {
      type: 'pulse' as const,
      speed: 'normal' as const,
    } as LinkAnimation,

    /** Data flowing backwards (reverse) */
    REVERSE: {
      type: 'flow' as const,
      speed: 'normal' as const,
      direction: 'reverse' as const,
    } as LinkAnimation,
  },

  /**
   * Connection Types
   */
  CONNECTION: {
    /** Standard marching ants for selection/focus */
    SELECTED: {
      type: 'marching-ants' as const,
      speed: 'normal' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** Highlighted connection */
    HIGHLIGHTED: {
      type: 'marching-ants' as const,
      speed: 'slow' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** Active/live connection */
    ACTIVE: {
      type: 'flow' as const,
      speed: 'normal' as const,
      direction: 'forward' as const,
    } as LinkAnimation,

    /** Inactive/disabled connection */
    INACTIVE: {
      type: 'none' as const,
    } as LinkAnimation,
  },

  /**
   * Node Highlight States
   */
  NODE: {
    /** Focused/selected node */
    SELECTED: {
      style: {
        animatedBorder: true,
        borderAnimationType: 'gradient' as const,
        borderAnimationSpeed: 2,
        borderAnimationColors: ['#3498db', '#2980b9']
      }
    },

    /** Hovered node */
    HOVERED: {
      style: {
        animatedBorder: true,
        borderAnimationType: 'breathe' as const,
        borderAnimationSpeed: 1.5,
      }
    },

    /** Active/processing node */
    ACTIVE: {
      style: {
        animatedBorder: true,
        borderAnimationType: 'pulse' as const,
        borderAnimationSpeed: 2,
      }
    },

    /** Highlighted node for attention */
    ATTENTION: {
      style: {
        animatedBorder: true,
        borderAnimationType: 'shimmer' as const,
        borderAnimationSpeed: 1.5,
        borderAnimationColors: ['#f39c12', '#e67e22']
      }
    },

    /** Default/idle state (no animation) */
    IDLE: {
      style: {
        animatedBorder: false,
      }
    },
  },

  /**
   * ETL/Data Pipeline Patterns
   */
  ETL: {
    /** Extract phase - data being pulled */
    EXTRACT: {
      node: {
        status: 'running' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'pulse' as const,
          borderAnimationSpeed: 1.5,
          borderAnimationColors: ['#3498db', '#2980b9']
        }
      },
      link: {
        type: 'flow' as const,
        speed: 'normal' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },

    /** Transform phase - data being processed */
    TRANSFORM: {
      node: {
        status: 'running' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'gradient' as const,
          borderAnimationSpeed: 2,
          borderAnimationColors: ['#9b59b6', '#8e44ad']
        }
      },
      link: {
        type: 'dash-flow' as const,
        speed: 'fast' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },

    /** Load phase - data being written */
    LOAD: {
      node: {
        status: 'running' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'breathe' as const,
          borderAnimationSpeed: 1.5,
          borderAnimationColors: ['#27ae60', '#229954']
        }
      },
      link: {
        type: 'flow' as const,
        speed: 'normal' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },
  },

  /**
   * Network/System Monitoring
   */
  MONITORING: {
    /** Healthy system component */
    HEALTHY: {
      node: {
        status: 'completed' as const,
        animateStatus: true,
        style: {
          animatedBorder: false,
        }
      }
    },

    /** Degraded performance */
    DEGRADED: {
      node: {
        status: 'warning' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'breathe' as const,
          borderAnimationSpeed: 1.5,
          borderAnimationColors: ['#f39c12', '#e67e22']
        }
      }
    },

    /** System failure */
    FAILED: {
      node: {
        status: 'error' as const,
        animateStatus: true,
        style: {
          animatedBorder: true,
          borderAnimationType: 'pulse' as const,
          borderAnimationSpeed: 2.5,
          borderAnimationColors: ['#e74c3c', '#c0392b']
        }
      }
    },

    /** Active network traffic */
    TRAFFIC: {
      link: {
        type: 'flow' as const,
        speed: 'fast' as const,
        direction: 'forward' as const,
      } as LinkAnimation
    },
  },
} as const;

/**
 * Apply a preset to a node
 *
 * @param node - Node to apply preset to
 * @param preset - Preset configuration
 * @returns Modified node (mutation)
 */
export function applyNodePreset(node: NodeModel, preset: typeof AnimationPresets.NODE[keyof typeof AnimationPresets.NODE]): NodeModel {
  if (preset.style) {
    node.style = node.style || {};
    Object.assign(node.style, preset.style);
  }
  return node;
}

/**
 * Apply a workflow preset to a node
 *
 * @param node - Node to apply preset to
 * @param preset - Workflow preset configuration
 * @returns Modified node (mutation)
 */
export function applyWorkflowPreset(
  node: NodeModel,
  preset: typeof AnimationPresets.WORKFLOW[keyof typeof AnimationPresets.WORKFLOW]
): NodeModel {
  if (preset.node) {
    // Update state properties if state exists
    if (node.state) {
      if (preset.node.status) {
        node.state.status = preset.node.status as any;
      }
      if (typeof preset.node.animateStatus !== 'undefined') {
        node.state.animateStatus = preset.node.animateStatus;
      }
    }

    if (preset.node.style) {
      node.style = node.style || {};
      Object.assign(node.style, preset.node.style);
    }
  }
  return node;
}

/**
 * Get link animation from a preset
 *
 * @param preset - Preset with link configuration
 * @returns Link animation configuration
 */
export function getLinkAnimationFromPreset(
  preset: typeof AnimationPresets.WORKFLOW[keyof typeof AnimationPresets.WORKFLOW] |
          typeof AnimationPresets.ETL[keyof typeof AnimationPresets.ETL]
): LinkAnimation {
  return preset.link;
}

/**
 * Common animation speed values
 */
export const AnimationSpeeds = {
  VERY_SLOW: 0.5,
  SLOW: 1,
  NORMAL: 1.5,
  FAST: 2,
  VERY_FAST: 3,
} as const;

/**
 * Common color schemes for animations
 */
export const AnimationColorSchemes = {
  BLUE: ['#3498db', '#2980b9'],
  GREEN: ['#27ae60', '#229954'],
  RED: ['#e74c3c', '#c0392b'],
  ORANGE: ['#f39c12', '#e67e22'],
  PURPLE: ['#9b59b6', '#8e44ad'],
  TEAL: ['#1abc9c', '#16a085'],
  YELLOW: ['#f1c40f', '#f39c12'],
  GRADIENT_COOL: ['#667eea', '#764ba2'],
  GRADIENT_WARM: ['#f093fb', '#f5576c'],
  GRADIENT_OCEAN: ['#4facfe', '#00f2fe'],
  GRADIENT_SUNSET: ['#fa709a', '#fee140'],
} as const;
