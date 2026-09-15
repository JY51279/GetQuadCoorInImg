export const INACTIVE_QUAD_INDEX = -1;

const NAVIGATION_POLICIES = Object.freeze({
  previous: Object.freeze({
    step: -1,
    getInactiveEntry: quadCount => quadCount - 1,
  }),
  next: Object.freeze({
    step: 1,
    getInactiveEntry: () => 0,
  }),
});

export function normalizeQuadIndex(index, quadCount) {
  return Number.isInteger(quadCount) && quadCount > 0 && Number.isInteger(index) && index >= 0 && index < quadCount
    ? index
    : INACTIVE_QUAD_INDEX;
}

export function getAdjacentQuadIndex({ activeIndex, quadCount, direction } = {}) {
  if (!Number.isInteger(quadCount) || quadCount <= 0) return INACTIVE_QUAD_INDEX;

  const normalizedIndex = normalizeQuadIndex(activeIndex, quadCount);
  const policy = NAVIGATION_POLICIES[direction];
  if (!policy) return normalizedIndex;
  if (normalizedIndex === INACTIVE_QUAD_INDEX) return policy.getInactiveEntry(quadCount);

  return normalizeQuadIndex(normalizedIndex + policy.step, quadCount);
}
