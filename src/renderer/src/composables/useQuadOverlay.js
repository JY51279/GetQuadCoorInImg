import { reactive, ref, unref } from 'vue';
import { datasetPointToImagePoint } from '../utils/AnnotationCoordinates.js';
import { getOuterInnerQuads, drawPath } from '../utils/ImageProcess.js';
import { getQuadCenterPoint, isPointInQuad } from '../utils/QuadGeometry.js';

export function isValidQuadPoints(quadPoints) {
  return (
    Array.isArray(quadPoints) &&
    quadPoints.length >= 4 &&
    quadPoints.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}

export function useQuadOverlay({
  activeQuadIndex,
  scale,
  gridLimit = 10,
  getContext = () => null,
  imageToCanvas = point => ({ ...point }),
  isMouseOver = () => false,
  mousePoint = { x: 0, y: 0 },
  outputMessage = () => {},
  hoverActivationEnabled = () => false,
  onSelectQuad = () => {},
} = {}) {
  const shownQuadIndices = reactive([]);
  const activePointHandles = ref([]);
  const activeCenterHandle = ref(null);
  const hoveredIndicesText = ref('');
  const drawnOuterQuads = [];
  let quads = [];

  function getActiveQuadIndex() {
    return unref(activeQuadIndex) ?? -1;
  }

  function getScale() {
    return unref(scale) ?? 1;
  }

  function getQuadCount() {
    return quads.length;
  }

  function getQuad(index) {
    return Number.isInteger(index) && index >= 0 && index < quads.length ? quads[index] : null;
  }

  function setQuadPoint(quadIndex, pointIndex, point) {
    const quad = getQuad(quadIndex);
    if (
      !isValidQuadPoints(quad) ||
      !Number.isInteger(pointIndex) ||
      pointIndex < 0 ||
      pointIndex >= 4 ||
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      return false;
    }
    quad[pointIndex] = { x: point.x, y: point.y };
    return true;
  }

  function setQuadPoints(quadIndex, points) {
    const quad = getQuad(quadIndex);
    if (!isValidQuadPoints(quad) || !Array.isArray(points) || points.length !== 4 || !isValidQuadPoints(points)) {
      return false;
    }
    quads[quadIndex] = points.map(point => ({ x: point.x, y: point.y }));
    return true;
  }

  function updateActivePointHandles() {
    const quad = getQuad(getActiveQuadIndex());
    if (!isValidQuadPoints(quad)) {
      activePointHandles.value = [];
      activeCenterHandle.value = null;
      return;
    }

    const currentScale = getScale();
    const pixelInset = currentScale >= gridLimit ? 1 : 0;
    activePointHandles.value = quad.slice(0, 4).map((point, pointIndex) => {
      const canvasPoint = imageToCanvas(point);
      return {
        pointIndex,
        x: canvasPoint.x + pixelInset + currentScale / 2,
        y: canvasPoint.y + pixelInset + currentScale / 2,
      };
    });
    const centerPoint = imageToCanvas(getQuadCenterPoint(quad));
    activeCenterHandle.value = {
      x: centerPoint.x + pixelInset + currentScale / 2,
      y: centerPoint.y + pixelInset + currentScale / 2,
    };
  }

  function resetQuads(
    newQuadArray,
    coordinateScale,
    { deletedIndex = null, insertedIndex = null, indexMutations = [] } = {},
  ) {
    quads = Array.isArray(newQuadArray)
      ? newQuadArray.map(quad => (Array.isArray(quad) ? quad.map(point => ({ ...point })) : quad))
      : [];
    quads.forEach(quad => {
      if (!isValidQuadPoints(quad)) return;
      quad.forEach((point, index) => {
        const mappedPoint = datasetPointToImagePoint(point, coordinateScale);
        if (mappedPoint !== null) quad[index] = mappedPoint;
      });
    });

    const mutations = Array.isArray(indexMutations) && indexMutations.length > 0 ? [...indexMutations] : [];
    if (mutations.length === 0 && Number.isInteger(deletedIndex) && deletedIndex >= 0) {
      mutations.push({ type: 'delete', index: deletedIndex });
    } else if (mutations.length === 0 && Number.isInteger(insertedIndex) && insertedIndex >= 0) {
      mutations.push({ type: 'insert', index: insertedIndex });
    }

    if (mutations.length > 0) {
      let remappedIndices = [...shownQuadIndices];
      for (const mutation of mutations) {
        if (!Number.isInteger(mutation?.index) || mutation.index < 0) continue;
        if (mutation.type === 'delete') {
          remappedIndices = remappedIndices
            .filter(index => index !== mutation.index)
            .map(index => (index > mutation.index ? index - 1 : index));
        } else if (mutation.type === 'insert') {
          remappedIndices = remappedIndices.map(index => (index >= mutation.index ? index + 1 : index));
        }
      }
      remappedIndices = remappedIndices.filter(index => index >= 0 && index < quads.length);
      shownQuadIndices.splice(0, shownQuadIndices.length, ...remappedIndices);
    }
    updateActivePointHandles();
  }

  function toggleShownQuad(index) {
    if (!Number.isInteger(index) || index < 0 || index >= quads.length) {
      outputMessage('Quad 显示序号超出范围。');
      return;
    }
    const shownIndex = shownQuadIndices.indexOf(index);
    if (shownIndex === -1) addShownQuad(index);
    else shownQuadIndices.splice(shownIndex, 1);
  }

  function addShownQuad(index) {
    if (!Number.isInteger(index) || index < 0 || index >= quads.length) {
      outputMessage('Quad 显示序号超出范围。');
      return;
    }
    if (!shownQuadIndices.includes(index)) {
      shownQuadIndices.push(index);
      moveActiveQuadToEnd();
    }
  }

  function moveActiveQuadToEnd() {
    const shownIndex = shownQuadIndices.indexOf(getActiveQuadIndex());
    if (shownIndex === -1) return false;
    shownQuadIndices.splice(shownIndex, 1);
    shownQuadIndices.push(getActiveQuadIndex());
    return true;
  }

  function clearShownQuads() {
    shownQuadIndices.splice(0, shownQuadIndices.length);
  }

  function drawQuad(context, quadPoints, isHighlight = false) {
    if (quadPoints.length < 4) {
      console.warn('Failed to draw quad');
      return;
    }
    context.save();
    context.strokeStyle = isHighlight ? '#FF0000' : '#000000';
    context.lineWidth = 1;
    drawPath(context, quadPoints);
    context.stroke();
    context.fillStyle = isHighlight ? '#0000FF' : '#00FF00';
    context.globalAlpha = 0.5;
    context.fill();
    context.restore();
  }

  function clearInnerQuad(context, quadPoints) {
    if (quadPoints.length < 4) {
      console.warn('Failed to clear quad');
      return;
    }
    context.save();
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 1;
    drawPath(context, quadPoints);
    context.stroke();
    context.clip();

    const xValues = quadPoints.map(point => point.x);
    const yValues = quadPoints.map(point => point.y);
    context.clearRect(
      Math.min(...xValues),
      Math.min(...yValues),
      Math.max(...xValues) - Math.min(...xValues),
      Math.max(...yValues) - Math.min(...yValues),
    );
    context.restore();
  }

  function drawQuadLine(context, quad, quadIndex, isHighlight = false) {
    if (!isValidQuadPoints(quad)) {
      console.warn('Failed to draw quad');
      return;
    }
    const canvasPoints = quad.slice(0, 4).map(point => imageToCanvas(point));
    const { outerQuadPoints, innerQuadPoints } = getOuterInnerQuads(canvasPoints, getScale());
    drawnOuterQuads.push({ index: quadIndex, points: outerQuadPoints });
    drawQuad(context, outerQuadPoints, isHighlight);
    clearInnerQuad(context, innerQuadPoints);
  }

  function drawOverlay() {
    const context = getContext();
    if (context === null) {
      console.warn('Failed to draw canvas for show quads');
      return false;
    }

    drawnOuterQuads.splice(0, drawnOuterQuads.length);
    hoveredIndicesText.value = '';
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    const currentActiveIndex = getActiveQuadIndex();
    for (const index of shownQuadIndices) {
      if (index === currentActiveIndex) continue;
      drawQuadLine(context, getQuad(index), index);
    }
    if (currentActiveIndex >= 0 && currentActiveIndex < quads.length) {
      drawQuadLine(context, getQuad(currentActiveIndex), currentActiveIndex, true);
    }
    updateActivePointHandles();
    updateHoveredInfo();
    return true;
  }

  function updateHoveredInfo(commitSelection = false) {
    if (!isMouseOver() || drawnOuterQuads.length === 0) return;
    const hoveredIndices = drawnOuterQuads
      .filter(({ points }) => isPointInQuad(mousePoint, points))
      .map(({ index }) => index);
    hoveredIndicesText.value = hoveredIndices.map(index => index + 1).join(' ');

    if (commitSelection && hoverActivationEnabled() && hoveredIndices.length === 1) {
      onSelectQuad(hoveredIndices[0]);
    }
  }

  function clear() {
    quads = [];
    activePointHandles.value = [];
    activeCenterHandle.value = null;
    shownQuadIndices.splice(0, shownQuadIndices.length);
    drawnOuterQuads.splice(0, drawnOuterQuads.length);
    hoveredIndicesText.value = '';
  }

  return {
    shownQuadIndices,
    activePointHandles,
    activeCenterHandle,
    hoveredIndicesText,
    getQuadCount,
    getQuad,
    setQuadPoint,
    setQuadPoints,
    resetQuads,
    toggleShownQuad,
    addShownQuad,
    moveActiveQuadToEnd,
    clearShownQuads,
    drawOverlay,
    updateHoveredInfo,
    updateActivePointHandles,
    clear,
  };
}
