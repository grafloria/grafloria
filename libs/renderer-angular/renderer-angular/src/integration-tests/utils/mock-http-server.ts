/**
 * MockHttpServer
 *
 * Simple mock HTTP server for integration tests.
 * Allows mocking API responses without actual network requests.
 *
 * @example
 * const server = new MockHttpServer();
 * server.onGet('/api/diagrams/123', { id: 123, name: 'Test Diagram' });
 * server.onPost('/api/diagrams', (req) => ({ id: Date.now(), ...req.body }));
 */
export class MockHttpServer {
  private routes: Map<string, MockRoute> = new Map();
  private requests: MockRequest[] = [];
  private defaultDelay = 0;

  /**
   * Register a GET route.
   */
  onGet(path: string, response: any | ((req: MockRequest) => any), status = 200): this {
    return this.addRoute('GET', path, response, status);
  }

  /**
   * Register a POST route.
   */
  onPost(path: string, response: any | ((req: MockRequest) => any), status = 201): this {
    return this.addRoute('POST', path, response, status);
  }

  /**
   * Register a PUT route.
   */
  onPut(path: string, response: any | ((req: MockRequest) => any), status = 200): this {
    return this.addRoute('PUT', path, response, status);
  }

  /**
   * Register a DELETE route.
   */
  onDelete(path: string, response: any | ((req: MockRequest) => any), status = 204): this {
    return this.addRoute('DELETE', path, response, status);
  }

  /**
   * Register a PATCH route.
   */
  onPatch(path: string, response: any | ((req: MockRequest) => any), status = 200): this {
    return this.addRoute('PATCH', path, response, status);
  }

  /**
   * Add a route with custom logic.
   */
  private addRoute(
    method: string,
    path: string,
    response: any | ((req: MockRequest) => any),
    status: number
  ): this {
    const key = `${method}:${path}`;
    this.routes.set(key, {
      method,
      path,
      response,
      status,
    });
    return this;
  }

  /**
   * Simulate a request.
   */
  async request(method: string, path: string, options: RequestOptions = {}): Promise<MockResponse> {
    const key = `${method}:${path}`;
    const route = this.routes.get(key);

    // Record request
    const request: MockRequest = {
      method,
      path,
      body: options.body,
      headers: options.headers || {},
      timestamp: Date.now(),
    };
    this.requests.push(request);

    // Simulate network delay
    if (this.defaultDelay > 0) {
      await this.delay(this.defaultDelay);
    }

    // Route not found
    if (!route) {
      return {
        status: 404,
        data: { error: 'Not Found', message: `Route ${method} ${path} not found` },
        headers: {},
      };
    }

    // Build response
    const responseData =
      typeof route.response === 'function' ? route.response(request) : route.response;

    return {
      status: route.status,
      data: responseData,
      headers: { 'Content-Type': 'application/json' },
    };
  }

  /**
   * Simulate network delay.
   */
  setDelay(ms: number): this {
    this.defaultDelay = ms;
    return this;
  }

  /**
   * Get all recorded requests.
   */
  getRequests(): MockRequest[] {
    return [...this.requests];
  }

  /**
   * Get requests matching a filter.
   */
  getRequestsMatching(filter: Partial<MockRequest>): MockRequest[] {
    return this.requests.filter(req => {
      if (filter.method && req.method !== filter.method) return false;
      if (filter.path && req.path !== filter.path) return false;
      return true;
    });
  }

  /**
   * Clear recorded requests.
   */
  clearRequests(): this {
    this.requests = [];
    return this;
  }

  /**
   * Clear all routes.
   */
  clearRoutes(): this {
    this.routes.clear();
    return this;
  }

  /**
   * Reset server (clear routes and requests).
   */
  reset(): this {
    this.clearRoutes();
    this.clearRequests();
    this.defaultDelay = 0;
    return this;
  }

  /**
   * Assert that a request was made.
   */
  assertRequestMade(method: string, path: string): void {
    const found = this.requests.some(req => req.method === method && req.path === path);
    if (!found) {
      throw new Error(`Expected request ${method} ${path} but it was not made`);
    }
  }

  /**
   * Assert request count.
   */
  assertRequestCount(expectedCount: number): void {
    if (this.requests.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} requests but got ${this.requests.length}`
      );
    }
  }

  /**
   * Create a RESTful resource endpoint.
   */
  addResource(basePath: string, initialData: any[] = []): MockResource {
    const resource = new MockResource(this, basePath, initialData);
    return resource;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock resource with CRUD operations.
 */
export class MockResource {
  private data: Map<number | string, any> = new Map();
  private nextId = 1;

  constructor(
    private server: MockHttpServer,
    private basePath: string,
    initialData: any[] = []
  ) {
    // Initialize data
    initialData.forEach(item => {
      const id = item.id || this.nextId++;
      this.data.set(id, { ...item, id });
    });

    // Setup routes
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // GET /resource - list all
    this.server.onGet(this.basePath, () => Array.from(this.data.values()));

    // GET /resource/:id - get by id
    this.server.onGet(`${this.basePath}/:id`, req => {
      const id = this.extractId(req.path);
      const item = this.data.get(id);
      if (!item) {
        return { error: 'Not found' };
      }
      return item;
    });

    // POST /resource - create
    this.server.onPost(this.basePath, req => {
      const id = this.nextId++;
      const item = { ...req.body, id };
      this.data.set(id, item);
      return item;
    });

    // PUT /resource/:id - update
    this.server.onPut(`${this.basePath}/:id`, req => {
      const id = this.extractId(req.path);
      const item = this.data.get(id);
      if (!item) {
        return { error: 'Not found' };
      }
      const updated = { ...item, ...req.body, id };
      this.data.set(id, updated);
      return updated;
    });

    // DELETE /resource/:id - delete
    this.server.onDelete(`${this.basePath}/:id`, req => {
      const id = this.extractId(req.path);
      this.data.delete(id);
      return null;
    });
  }

  private extractId(path: string): number {
    const parts = path.split('/');
    return parseInt(parts[parts.length - 1]);
  }

  getData(): any[] {
    return Array.from(this.data.values());
  }

  getById(id: number | string): any | undefined {
    return this.data.get(id);
  }

  clear(): void {
    this.data.clear();
    this.nextId = 1;
  }
}

export interface MockRoute {
  method: string;
  path: string;
  response: any | ((req: MockRequest) => any);
  status: number;
}

export interface MockRequest {
  method: string;
  path: string;
  body?: any;
  headers: Record<string, string>;
  timestamp: number;
}

export interface MockResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

export interface RequestOptions {
  body?: any;
  headers?: Record<string, string>;
}
