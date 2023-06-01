export const createCslContext = () => {
  const pointers = [] as ({ free: () => void })[];
  const wrap = <T extends { free: () => void }>(p: T) => {
    if (pointers.indexOf(p) !== -1) {
      pointers.push(p);
    }
    return p;
  };

  const wrapU = <T extends { free: () => void }>(p: T | undefined) => {
    if (!p) return p;
    if (pointers.indexOf(p) !== -1) {
      pointers.push(p);
    }
    return p;
  };

  const freeAll = () => {
    for (const p of pointers) {
      p.free();
    }
    pointers.length = 0;
  };

  return {
    wrap,
    wrapU,
    freeAll,
  };
};

export type CslContext = ReturnType<typeof createCslContext>;
