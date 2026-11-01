import { describe, it, expect } from 'vitest';
import { changedFields } from './overrides';

describe('changedFields', () => {
  const original = { title: 'November Meeting', location: undefined as string | undefined, options: ['Yes', 'No'], pinned: false };

  it('returns nothing when nothing was edited', () => {
    expect(changedFields(original, { ...original }, ['title', 'location', 'options', 'pinned'])).toEqual({});
  });

  it('returns only the fields that differ', () => {
    expect(changedFields(original, { ...original, title: 'X', pinned: true }, ['title', 'location', 'options', 'pinned'])).toEqual({
      title: 'X',
      pinned: true,
    });
  });

  it('treats a missing optional text field and an empty one as the same', () => {
    expect(changedFields(original, { ...original, location: '' }, ['location'])).toEqual({});
    expect(changedFields(original, { ...original, location: 'Pavilion' }, ['location'])).toEqual({ location: 'Pavilion' });
  });

  it('clears a field that had a value by sending it empty', () => {
    expect(changedFields({ location: 'Pavilion' }, { location: '' }, ['location'])).toEqual({ location: '' });
  });

  it('compares lists by value, in order', () => {
    expect(changedFields(original, { ...original, options: ['Yes', 'No'] }, ['options'])).toEqual({});
    expect(changedFields(original, { ...original, options: ['Yes', 'No', 'Maybe'] }, ['options'])).toEqual({
      options: ['Yes', 'No', 'Maybe'],
    });
    expect(changedFields(original, { ...original, options: ['No', 'Yes'] }, ['options'])).toEqual({ options: ['No', 'Yes'] });
  });

  it('ignores fields outside the keys it was asked about', () => {
    expect(changedFields(original, { ...original, title: 'X', pinned: true }, ['title'])).toEqual({ title: 'X' });
  });
});
