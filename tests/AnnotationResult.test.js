import { describe, expect, it } from 'vitest';
import { parseAnnotationResult } from '../src/shared/AnnotationResult.js';

const question = {
  id: 'q1',
  purpose: 'refine',
  prompt: '右侧码区的模糊类型能否进一步确认？',
  selection: 'single',
  options: [
    { id: 'motion', label: '运动模糊' },
    { id: 'unknown', label: '无法判断' },
  ],
};

describe('annotation result protocol', () => {
  it('accepts feedback and both final outcomes as distinct results', () => {
    expect(parseAnnotationResult(JSON.stringify({ status: 'needs_feedback', questions: [question] }))).toEqual({
      status: 'needs_feedback',
      questions: [question],
    });
    expect(parseAnnotationResult('{"status":"final","completed":true,"annotation":""}')).toEqual({
      status: 'final',
      completed: true,
      annotation: '',
    });
    expect(parseAnnotationResult('{"status":"final","completed":false,"annotation":""}')).toEqual({
      status: 'final',
      completed: false,
      annotation: '',
    });
  });

  it('rejects old, mixed, incomplete and malformed branches', () => {
    const invalid = [
      { completed: true, annotation: '旧格式' },
      { status: 'unknown', completed: true, annotation: '内容' },
      { status: 'needs_feedback', questions: [] },
      { status: 'needs_feedback', questions: [question], completed: true, annotation: '误存' },
      { status: 'needs_feedback', questions: [{ ...question, purpose: 'other' }] },
      { status: 'needs_feedback', questions: [question, question] },
      { status: 'needs_feedback', questions: [{ ...question, options: [question.options[0], question.options[0]] }] },
      { status: 'final', completed: false, annotation: '不应保存' },
      { status: 'final', completed: true, annotation: '内容', questions: [question] },
    ];
    for (const result of invalid) expect(() => parseAnnotationResult(JSON.stringify(result))).toThrow();
  });
});
