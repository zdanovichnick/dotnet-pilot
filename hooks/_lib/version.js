// Semver ordering shared by the hooks that install versioned artifacts into
// ~/.claude (the CLAUDE.md rule block, the statusline script). Two plugin
// installs of different versions must not overwrite each other in turn, so an
// artifact is only replaced by a strictly newer version.

function parse(v) {
  const [core, pre] = String(v).split('+')[0].split(/-(.*)/s);
  return {
    core: core.split('.').map(n => parseInt(n, 10) || 0),
    pre: pre ? pre.split('.') : [],
  };
}

function comparePre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) {
      const d = Number(a[i]) - Number(b[i]);
      if (d) return Math.sign(d);
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.core.length, pb.core.length); i++) {
    const d = (pa.core[i] || 0) - (pb.core[i] || 0);
    if (d) return Math.sign(d);
  }
  return comparePre(pa.pre, pb.pre);
}

// True when `a` is strictly newer than `b`. A missing `a` is never newer (leave
// the installed copy alone); a missing `b` always is (nothing installed yet).
function isNewer(a, b) {
  if (!a) return false;
  if (!b) return true;
  return compareVersions(a, b) > 0;
}

module.exports = { compareVersions, isNewer };
