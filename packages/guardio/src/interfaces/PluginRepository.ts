/**
 * Document stored by a plugin via PluginRepository.
 * The plugin_id is not exposed as it's automatically managed by the scoped repository.
 */
export interface PluginDocument {
  id: string;
  contextKey: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Query filter for finding plugin documents.
 */
export interface PluginDocumentFilter {
  /** Filter by context_key (supports LIKE patterns with %). */
  contextKey?: string;
  /** Filter by JSON fields using containment (e.g., { status: "active" }). */
  dataFilter?: Record<string, unknown>;
}

/**
 * Repository for plugin-specific document storage.
 * Each instance is scoped to a specific plugin_id, automatically filtering all operations.
 * Plugins receive this via PolicyPluginContext and cannot access other plugins' data.
 */
export interface PluginRepository {
  /**
   * Save a document. If a document with the same contextKey exists, it will be updated (upsert).
   * @param contextKey Plugin-defined namespace (e.g., "agent-123", "session-abc")
   * @param data Arbitrary JSON payload to store
   * @param id Optional document ID; if omitted, a UUID is generated
   * @returns The document ID (generated or provided)
   */
  saveDocument(
    contextKey: string,
    data: Record<string, unknown>,
    id?: string,
  ): Promise<string>;

  /**
   * Get a document by contextKey. Returns the most recent document for this key.
   * @param contextKey The context key to look up
   * @returns The document or null if not found
   */
  getDocument(contextKey: string): Promise<PluginDocument | null>;

  /**
   * List all documents, optionally filtered by contextKey prefix.
   * @param contextKey Optional context key filter (exact match)
   * @returns Array of documents
   */
  listDocuments(contextKey?: string): Promise<PluginDocument[]>;

  /**
   * Query documents with filters.
   * @param filter Query filter with contextKey pattern and/or JSON field filters
   * @returns Array of matching documents
   */
  queryDocuments(filter: PluginDocumentFilter): Promise<PluginDocument[]>;

  /**
   * Delete a document by ID.
   * @param id The document ID to delete
   * @returns true if deleted, false if not found
   */
  deleteDocument(id: string): Promise<boolean>;
}
