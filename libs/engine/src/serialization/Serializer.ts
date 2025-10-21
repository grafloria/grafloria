// DiagramSerializer - Stub implementation for serialization
// TODO: Implement full serialization in future phase

import { DiagramModel } from '../models/DiagramModel';
import type { SerializedDiagram } from '../models/DiagramModel';

// Re-export for convenience
export type { SerializedDiagram } from '../models/DiagramModel';

export class DiagramSerializer {
  /**
   * Serialize diagram to plain object
   */
  serialize(diagram: DiagramModel): SerializedDiagram {
    return diagram.serialize();
  }

  /**
   * Deserialize diagram from plain object
   */
  deserialize(data: SerializedDiagram): DiagramModel {
    // Use static fromJSON method
    return DiagramModel.fromJSON(data);
  }
}
