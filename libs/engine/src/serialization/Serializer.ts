// DiagramSerializer - Handles diagram serialization/deserialization

import { DiagramModel } from '../models/DiagramModel';
import type { SerializedDiagram as DiagramSerializedData } from '../models/DiagramModel';
import type { DiagramMode } from '../engine/DiagramMode';

// Serializer's output type with string version for format version
export interface SerializedDiagram extends Omit<DiagramSerializedData, 'version'> {
  version: string; // Serializer format version
  diagramVersion?: number; // Original diagram version
  mode?: DiagramMode; // Current diagram mode
}

export class DiagramSerializer {
  private readonly VERSION = '1.0.0';

  /**
   * Serialize diagram to plain object
   */
  serialize(diagram: DiagramModel): SerializedDiagram {
    const serialized = diagram.serialize();
    // Override version with serializer format version
    return {
      ...serialized,
      version: this.VERSION,
      diagramVersion: serialized.version,
    };
  }

  /**
   * Deserialize diagram from plain object
   */
  deserialize(data: SerializedDiagram): DiagramModel {
    // Convert back to diagram format
    const diagramData: DiagramSerializedData = {
      ...data,
      version: data.diagramVersion || 1,
    };
    // Use static fromJSON method
    return DiagramModel.fromJSON(diagramData);
  }
}
