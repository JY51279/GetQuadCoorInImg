export function capturePointer(element, pointerId) {
  try {
    element?.setPointerCapture?.(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function releasePointer(element, pointerId) {
  // The gesture must already be idle before release can emit lostpointercapture.
  try {
    if (element?.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // A detached element or an already-ended native pointer needs no further cleanup.
  }
}
