/* Branch dependencies, not shared targets or similar names, define a stack. */
(function (root) {
  function buildStacks(prs) {
    const parent = new Map();
    for (const pr of prs) {
      const candidates = prs.filter(other => other.number !== pr.number && other.head === pr.base
        && (!pr.baseRepo || !other.headRepo || pr.baseRepo === other.headRepo));
      if (candidates.length === 1) parent.set(pr.number, candidates[0]);
    }
    // Bad/cyclic metadata must never lose a card or recurse forever.
    for (const pr of prs) {
      const seen = new Set([pr.number]);
      let next = parent.get(pr.number);
      while (next) {
        if (seen.has(next.number)) { parent.delete(pr.number); break; }
        seen.add(next.number);
        next = parent.get(next.number);
      }
    }
    const groups = new Map();
    for (const pr of prs) {
      let base = pr;
      while (parent.has(base.number)) base = parent.get(base.number);
      if (!groups.has(base.number)) groups.set(base.number, { root: base, members: [] });
      groups.get(base.number).members.push(pr);
    }
    for (const group of groups.values()) {
      const ordered = [];
      function visit(pr, depth) {
        ordered.push({ pr, depth, parent: parent.get(pr.number) || null });
        for (const child of group.members) if (parent.get(child.number)?.number === pr.number) visit(child, depth + 1);
      }
      visit(group.root, 0);
      group.members = ordered;
    }
    return [...groups.values()];
  }
  if (typeof module !== 'undefined') module.exports = { buildStacks };
  else root.buildStacks = buildStacks;
})(globalThis);
