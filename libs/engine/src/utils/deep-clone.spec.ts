// deep-clone.spec.ts - Tests for deepClone utility with circular reference handling

import { deepClone, deepEqual } from './deep-clone';

describe('deepClone', () => {
  describe('Basic Types', () => {
    it('should clone primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('should clone Date objects', () => {
      const date = new Date('2024-01-01');
      const cloned = deepClone(date);
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should clone RegExp objects', () => {
      const regex = /test/gi;
      const cloned = deepClone(regex);
      expect(cloned.source).toBe(regex.source);
      expect(cloned.flags).toBe(regex.flags);
      expect(cloned).not.toBe(regex);
    });
  });

  describe('Arrays', () => {
    it('should clone arrays', () => {
      const arr = [1, 2, 3];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
    });

    it('should deep clone nested arrays', () => {
      const arr = [1, [2, 3], [4, [5, 6]]];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned[1]).not.toBe(arr[1]);
      expect(cloned[2]).not.toBe(arr[2]);
    });
  });

  describe('Objects', () => {
    it('should clone plain objects', () => {
      const obj = { a: 1, b: 2 };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
    });

    it('should deep clone nested objects', () => {
      const obj = { a: 1, b: { c: 2, d: { e: 3 } } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned.b).not.toBe(obj.b);
      expect(cloned.b.d).not.toBe(obj.b.d);
    });
  });

  describe('Maps and Sets', () => {
    it('should clone Maps', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const cloned = deepClone(map);
      expect(cloned).toEqual(map);
      expect(cloned).not.toBe(map);
    });

    it('should clone Sets', () => {
      const set = new Set([1, 2, 3]);
      const cloned = deepClone(set);
      expect(cloned).toEqual(set);
      expect(cloned).not.toBe(set);
    });

    it('should deep clone nested Maps', () => {
      const inner = { value: 42 };
      const map = new Map([['key', inner]]);
      const cloned = deepClone(map);
      expect(cloned.get('key')).toEqual(inner);
      expect(cloned.get('key')).not.toBe(inner);
    });
  });

  describe('Circular References', () => {
    it('should handle circular object references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      const cloned = deepClone(obj);

      expect(cloned.a).toBe(1);
      expect(cloned.self).toBe(cloned);
      expect(cloned).not.toBe(obj);
    });

    it('should handle circular array references', () => {
      const arr: any = [1, 2, 3];
      arr.push(arr);

      const cloned = deepClone(arr);

      expect(cloned[0]).toBe(1);
      expect(cloned[3]).toBe(cloned);
      expect(cloned).not.toBe(arr);
    });

    it('should handle mutual circular references', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2' };
      obj1.ref = obj2;
      obj2.ref = obj1;

      const cloned = deepClone(obj1);

      expect(cloned.name).toBe('obj1');
      expect(cloned.ref.name).toBe('obj2');
      expect(cloned.ref.ref).toBe(cloned);
      expect(cloned).not.toBe(obj1);
    });

    it('should handle circular references in Maps', () => {
      const map: any = new Map();
      map.set('self', map);
      map.set('value', 42);

      const cloned = deepClone(map);

      expect(cloned.get('value')).toBe(42);
      expect(cloned.get('self')).toBe(cloned);
      expect(cloned).not.toBe(map);
    });

    it('should handle circular references in Sets', () => {
      const set: any = new Set();
      const obj: any = { set };
      set.add(obj);

      const cloned = deepClone(set);

      expect(cloned.size).toBe(1);
      const clonedObj = Array.from(cloned)[0] as any;
      expect(clonedObj.set).toBe(cloned);
    });

    it('should handle diagram-like circular structure (node.diagram.nodes.get(id) === node)', () => {
      // Simulate NodeModel -> DiagramModel -> nodes Map -> NodeModel cycle
      const diagram: any = {
        id: 'diagram1',
        nodes: new Map(),
      };

      const node: any = {
        id: 'node1',
        position: { x: 100, y: 200 },
        diagram: diagram,
      };

      diagram.nodes.set('node1', node);

      const clonedDiagram = deepClone(diagram);

      expect(clonedDiagram.id).toBe('diagram1');
      expect(clonedDiagram).not.toBe(diagram);
      expect(clonedDiagram.nodes).not.toBe(diagram.nodes);

      const clonedNode = clonedDiagram.nodes.get('node1');
      expect(clonedNode).toBeDefined();
      expect(clonedNode.id).toBe('node1');
      expect(clonedNode.position).toEqual({ x: 100, y: 200 });
      expect(clonedNode.diagram).toBe(clonedDiagram);
      expect(clonedNode).not.toBe(node);
    });

    it('should handle deep circular chains', () => {
      const a: any = { name: 'a' };
      const b: any = { name: 'b', prev: a };
      const c: any = { name: 'c', prev: b };
      a.next = b;
      b.next = c;
      c.next = a; // Circular

      const cloned = deepClone(a);

      expect(cloned.name).toBe('a');
      expect(cloned.next.name).toBe('b');
      expect(cloned.next.next.name).toBe('c');
      expect(cloned.next.next.next).toBe(cloned);
    });
  });

  describe('Mixed Structures', () => {
    it('should handle complex nested structures with circularity', () => {
      const root: any = {
        data: { value: 42 },
        children: [{ name: 'child1' }, { name: 'child2' }],
        metadata: new Map([['key', 'value']]),
        tags: new Set(['tag1', 'tag2']),
      };
      root.children[0].parent = root;
      root.children[1].parent = root;

      const cloned = deepClone(root);

      expect(cloned.data.value).toBe(42);
      expect(cloned.data).not.toBe(root.data);
      expect(cloned.children).not.toBe(root.children);
      expect(cloned.children[0].parent).toBe(cloned);
      expect(cloned.children[1].parent).toBe(cloned);
      expect(cloned.metadata).not.toBe(root.metadata);
      expect(cloned.tags).not.toBe(root.tags);
    });
  });

  describe('Edge Cases', () => {
    it('should handle same object referenced multiple times (not circular)', () => {
      const shared = { value: 42 };
      const obj = { a: shared, b: shared };

      const cloned = deepClone(obj);

      expect(cloned.a).toEqual(shared);
      expect(cloned.b).toEqual(shared);
      expect(cloned.a).toBe(cloned.b); // Should be same reference in clone
      expect(cloned.a).not.toBe(shared); // But not same as original
    });

    it('should handle empty objects', () => {
      expect(deepClone({})).toEqual({});
      expect(deepClone([])).toEqual([]);
      expect(deepClone(new Map())).toEqual(new Map());
      expect(deepClone(new Set())).toEqual(new Set());
    });

    it('should not clone class instances (return reference)', () => {
      class CustomClass {
        value = 42;
      }
      const instance = new CustomClass();
      const cloned = deepClone(instance);

      // Should return same reference for class instances to avoid breaking them
      expect(cloned).toBe(instance);
    });
  });
});

describe('deepEqual', () => {
  it('should compare primitives', () => {
    expect(deepEqual(42, 42)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);

    expect(deepEqual(42, 43)).toBe(false);
    expect(deepEqual('hello', 'world')).toBe(false);
  });

  it('should compare objects deeply', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 3 } })).toBe(true);

    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('should compare arrays deeply', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);

    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('should compare Maps', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map3 = new Map([
      ['a', 1],
      ['b', 3],
    ]);

    expect(deepEqual(map1, map2)).toBe(true);
    expect(deepEqual(map1, map3)).toBe(false);
  });

  it('should compare Sets', () => {
    expect(deepEqual(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(true);
    expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });
});
