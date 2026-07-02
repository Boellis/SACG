import { describe, it, expect } from 'vitest';
import { personalize, firstNameOf } from './personalize';

const member = { displayName: 'Jane Marie Doe', email: 'jane@example.com' };

describe('firstNameOf', () => {
  it('returns the first word', () => {
    expect(firstNameOf('Jane Marie Doe')).toBe('Jane');
  });
  it('handles single names and extra whitespace', () => {
    expect(firstNameOf('  Bob  ')).toBe('Bob');
  });
  it('returns empty string for empty input', () => {
    expect(firstNameOf('')).toBe('');
  });
});

describe('personalize', () => {
  it('replaces {name}, {firstName}, and {email}', () => {
    expect(personalize('Hi {firstName}!', member)).toBe('Hi Jane!');
    expect(personalize('To {name} <{email}>', member)).toBe('To Jane Marie Doe <jane@example.com>');
  });

  it('replaces every occurrence of a token', () => {
    expect(personalize('{firstName} {firstName}', member)).toBe('Jane Jane');
  });

  it('leaves unknown tokens untouched', () => {
    expect(personalize('Plot {plotId} for {firstName}', member)).toBe('Plot {plotId} for Jane');
  });

  it('returns templates without tokens unchanged', () => {
    expect(personalize('No tokens here.', member)).toBe('No tokens here.');
  });

  it('substitutes empty string for missing member fields', () => {
    expect(personalize('Hi {firstName}', { displayName: '', email: '' })).toBe('Hi ');
  });
});
