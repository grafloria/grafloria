// DiagramSerializer - Handles diagram serialization/deserialization

import { DiagramModel } from '../models/DiagramModel';
import type {
  SerializedDiagram as DiagramSerializedData,
  DiagramLoadOptions,
} from '../models/DiagramModel';
import type { DiagramMode } from '../engine/DiagramMode';
import {
  wrapDiagramDocument,
  unwrapDiagramDocument,
  isDiagramDocumentEnvelope,
  type DiagramDocumentEnvelope,
  type WrapOptions,
} from './DocumentEnvelope';

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
   * Serialize wrapped in the portable document envelope (generator identity,
   * createdAt, integrity checksum). The envelope is the recommended shape for
   * NEW persistence; deserialize() accepts both it and the legacy flat form.
   */
  serializeEnvelope(diagram: DiagramModel, options?: WrapOptions): DiagramDocumentEnvelope {
    return wrapDiagramDocument(diagram.serialize(), options);
  }

  /**
   * Deserialize diagram from plain object — accepts the enveloped document,
   * the legacy Serializer flat form, or a raw DiagramModel.serialize payload.
   * Envelope checksums are verified (mismatch throws — corruption must never
   * load silently).
   */
  deserialize(
    data: SerializedDiagram | DiagramDocumentEnvelope,
    options?: DiagramLoadOptions
  ): DiagramModel {
    if (isDiagramDocumentEnvelope(data)) {
      const { document } = unwrapDiagramDocument(data);
      return DiagramModel.fromJSON(document, options);
    }
    // Legacy flat form: convert back to diagram format
    const diagramData: DiagramSerializedData = {
      ...data,
      version: data.diagramVersion || Number(data.version) || 1,
    };
    // Use static fromJSON method (migrations + optional validation run there)
    return DiagramModel.fromJSON(diagramData, options);
  }
}
