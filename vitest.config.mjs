import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,vue}'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Vitest 4.1 applies this per-file switch to every glob below. No global floor:
      // keep UI/bootstrap coverage visible without letting it dilute critical-module gates.
      thresholds: {
        perFile: true,
        'src/renderer/src/state/DatasetState.js': { lines: 85, branches: 85 },
        'src/renderer/src/state/{WorkflowState,ImageSession,PointerGestureState}.js': { lines: 90, branches: 90 },
        'src/renderer/src/composables/useDataset{Load,Save}Transaction.js': { lines: 90, branches: 85 },
        'src/renderer/src/composables/useWorkspaceDataset.js': { lines: 85, branches: 85 },
        'src/renderer/src/composables/useWorkspaceEditing.js': { lines: 80, branches: 80 },
        'src/renderer/src/composables/useWorkspaceImages.js': { lines: 75, branches: 65 },
        'src/renderer/src/composables/use{CanvasPan,QuadPoint}Gesture.js': { lines: 95, branches: 90 },
        'src/renderer/src/composables/useQuadTranslationGesture.js': { lines: 85, branches: 75 },
        'src/renderer/src/utils/{DatasetPreparation,AnnotationCoordinates,RendererImageLoader,PointerCapture,ViewportDrawScheduler}.js':
          {
            lines: 100,
            branches: 95,
          },
        'src/renderer/src/utils/{QuadGeometry,ImageViewGeometry}.js': { lines: 90, branches: 85 },
        'src/renderer/src/services/*.js': { lines: 85, branches: 90 },
        'src/shared/*.js': { lines: 100, branches: 95 },
        'src/main/{FileOperations,ImageFileReader}.js': { lines: 80, branches: 70 },
        'src/main/WorkspaceSessionStore.js': { lines: 95, branches: 85 },
        'src/main/IpcHandlers.js': { lines: 90, branches: 90 },
      },
    },
  },
});
