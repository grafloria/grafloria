// GroupModel.containment.spec.ts - Wave-2 compound-graph containment tree
//
// Covers: parentGroupId round-trip, getAncestors/getDescendants/getDepth on a
// nested tree, cycle prevention in addMember + setParent, memberValidation, and
// nesting a group inside a group.

import { GroupModel } from './GroupModel';
import { DiagramModel } from './DiagramModel';

/** Build a 3-level nested tree: root > parent > child (via addMember). */
function buildNestedTree(): {
  diagram: DiagramModel;
  root: GroupModel;
  parent: GroupModel;
  child: GroupModel;
} {
  const diagram = new DiagramModel();
  const root = new GroupModel({ id: 'root', name: 'Root' });
  const parent = new GroupModel({ id: 'parent', name: 'Parent' });
  const child = new GroupModel({ id: 'child', name: 'Child' });

  diagram.addGroup(root);
  diagram.addGroup(parent);
  diagram.addGroup(child);

  root.addMember(parent.id, diagram);
  parent.addMember(child.id, diagram);

  return { diagram, root, parent, child };
}

describe('GroupModel containment (Wave-2)', () => {
  describe('parentGroupId serialization round-trip', () => {
    it('round-trips parentGroupId through serialize/fromJSON', () => {
      const group = new GroupModel({ id: 'g1', name: 'G1' });
      group.parentGroupId = 'parent-group';

      const json = group.serialize();
      expect(json.parentGroupId).toBe('parent-group');

      const restored = GroupModel.fromJSON(json);
      expect(restored.parentGroupId).toBe('parent-group');
    });

    it('omits parentGroupId for a top-level group', () => {
      const group = new GroupModel({ id: 'g1', name: 'G1' });

      const json = group.serialize();
      expect(json.parentGroupId).toBeUndefined();

      const restored = GroupModel.fromJSON(json);
      expect(restored.parentGroupId).toBeUndefined();
    });

    it('preserves the nesting tree through a full diagram serialize round-trip', () => {
      const { diagram } = buildNestedTree();

      const restored = DiagramModel.fromJSON(diagram.serialize());

      expect(restored.getGroup('parent')!.parentGroupId).toBe('root');
      expect(restored.getGroup('child')!.parentGroupId).toBe('parent');
      expect(restored.getAncestors('child').map((g) => g.id)).toEqual([
        'parent',
        'root',
      ]);
    });
  });

  describe('getAncestors / getDescendants / getDepth', () => {
    it('returns ancestors nearest-first', () => {
      const { diagram } = buildNestedTree();

      expect(diagram.getAncestors('child').map((g) => g.id)).toEqual([
        'parent',
        'root',
      ]);
      expect(diagram.getAncestors('parent').map((g) => g.id)).toEqual(['root']);
      expect(diagram.getAncestors('root')).toEqual([]);
    });

    it('returns all transitive descendants', () => {
      const { diagram } = buildNestedTree();

      expect(diagram.getDescendants('root').map((g) => g.id).sort()).toEqual([
        'child',
        'parent',
      ]);
      expect(diagram.getDescendants('parent').map((g) => g.id)).toEqual(['child']);
      expect(diagram.getDescendants('child')).toEqual([]);
    });

    it('computes depth as the ancestor count', () => {
      const { diagram } = buildNestedTree();

      expect(diagram.getDepth('root')).toBe(0);
      expect(diagram.getDepth('parent')).toBe(1);
      expect(diagram.getDepth('child')).toBe(2);
    });

    it('handles a group with multiple direct children', () => {
      const diagram = new DiagramModel();
      const root = new GroupModel({ id: 'root', name: 'Root' });
      const a = new GroupModel({ id: 'a', name: 'A' });
      const b = new GroupModel({ id: 'b', name: 'B' });
      diagram.addGroup(root);
      diagram.addGroup(a);
      diagram.addGroup(b);

      root.addMember('a', diagram);
      root.addMember('b', diagram);

      expect(diagram.getDescendants('root').map((g) => g.id).sort()).toEqual([
        'a',
        'b',
      ]);
      expect(diagram.getDepth('a')).toBe(1);
      expect(diagram.getDepth('b')).toBe(1);
    });
  });

  describe('nesting a group inside a group', () => {
    it('sets the child parentGroupId when a group is added as a member', () => {
      const { parent, child } = buildNestedTree();

      expect(parent.members.has('child')).toBe(true);
      expect(child.parentGroupId).toBe('parent');
    });

    it('keeps members and parentGroupId consistent when a member group is removed', () => {
      const { parent, child, diagram } = buildNestedTree();

      parent.removeMember('child', diagram);

      expect(parent.members.has('child')).toBe(false);
      expect(child.parentGroupId).toBeUndefined();
      expect(diagram.getAncestors('child')).toEqual([]);
    });

    it('resolves the diagram from metadata when not passed explicitly', () => {
      const diagram = new DiagramModel();
      const outer = new GroupModel({ id: 'outer', name: 'Outer' });
      const inner = new GroupModel({ id: 'inner', name: 'Inner' });
      diagram.addGroup(outer);
      diagram.addGroup(inner);

      // No diagram argument -> falls back to metadata reference set by addGroup.
      outer.addMember('inner');

      expect(inner.parentGroupId).toBe('outer');
    });
  });

  describe('cycle prevention', () => {
    it('rejects adding an ancestor as a member (addMember)', () => {
      const { root, child, diagram } = buildNestedTree();

      // child contains nothing; root is an ancestor of child.
      child.addMember('root', diagram);

      expect(child.members.has('root')).toBe(false);
      expect(root.parentGroupId).toBeUndefined();
      expect(child.canAddMember('root', diagram)).toBe(false);
    });

    it('rejects adding a group to itself', () => {
      const diagram = new DiagramModel();
      const g = new GroupModel({ id: 'g', name: 'G' });
      diagram.addGroup(g);

      g.addMember('g', diagram);

      expect(g.members.has('g')).toBe(false);
      expect(g.canAddMember('g', diagram)).toBe(false);
    });

    it('rejects setParent onto one of its own descendants (setParent)', () => {
      const { root, child, diagram } = buildNestedTree();

      const ok = root.setParent('child', diagram);

      expect(ok).toBe(false);
      expect(root.parentGroupId).toBeUndefined();
    });

    it('allows a valid setParent reparent and syncs members sets', () => {
      const diagram = new DiagramModel();
      const oldParent = new GroupModel({ id: 'old', name: 'Old' });
      const newParent = new GroupModel({ id: 'new', name: 'New' });
      const g = new GroupModel({ id: 'g', name: 'G' });
      diagram.addGroup(oldParent);
      diagram.addGroup(newParent);
      diagram.addGroup(g);

      oldParent.addMember('g', diagram);
      expect(g.parentGroupId).toBe('old');

      const ok = g.setParent('new', diagram);

      expect(ok).toBe(true);
      expect(g.parentGroupId).toBe('new');
      expect(oldParent.members.has('g')).toBe(false);
      expect(newParent.members.has('g')).toBe(true);
    });
  });

  describe('memberValidation predicate', () => {
    it('rejects an invalid candidate in addMember', () => {
      const group = new GroupModel({ id: 'g', name: 'G' });
      group.memberValidation = (candidateId) => candidateId !== 'blocked';

      group.addMember('blocked');
      group.addMember('allowed');

      expect(group.members.has('blocked')).toBe(false);
      expect(group.members.has('allowed')).toBe(true);
    });

    it('reports rejection via canAddMember', () => {
      const group = new GroupModel({ id: 'g', name: 'G' });
      group.memberValidation = (candidateId, grp) =>
        candidateId.startsWith('ok-') && grp.id === 'g';

      expect(group.canAddMember('ok-node')).toBe(true);
      expect(group.canAddMember('bad-node')).toBe(false);
    });
  });
});
