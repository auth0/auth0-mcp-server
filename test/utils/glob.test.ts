import { describe, it, expect } from 'vitest';
import { Glob } from '../../src/utils/glob';

describe('Glob', () => {
  describe('constructor', () => {
    it('should create a valid glob from a simple pattern', () => {
      // Arrange & Act
      const glob = new Glob('simple');

      // Assert
      expect(glob.toString()).toBe('simple');
    });

    it('should trim whitespace from patterns', () => {
      // Arrange & Act
      const glob = new Glob('  test  ');

      // Assert
      expect(glob.toString()).toBe('test');
    });
  });

  describe('hasWildcards', () => {
    it('should detect patterns with wildcards', () => {
      // Arrange & Act & Assert
      expect(new Glob('test*').hasWildcards()).toBe(true);
      expect(new Glob('te?t').hasWildcards()).toBe(true);
      expect(new Glob('test').hasWildcards()).toBe(false);
      expect(new Glob('te*?t').hasWildcards()).toBe(true);
    });
  });

  describe('matches', () => {
    it('should match exact strings', () => {
      // Arrange
      const glob = new Glob('exact');

      // Act & Assert
      expect(glob.matches('exact')).toBe(true);
      expect(glob.matches('exactplus')).toBe(false);
      expect(glob.matches('inExact')).toBe(false);
    });

    it('should handle empty and null inputs', () => {
      // Arrange
      const glob = new Glob('test');

      // Act & Assert
      expect(glob.matches('')).toBe(false);
      expect(glob.matches(null as unknown as string)).toBe(false);
      expect(glob.matches(undefined as unknown as string)).toBe(false);
    });

    it('should match star wildcard at the end', () => {
      // Arrange
      const glob = new Glob('test*');

      // Act & Assert
      expect(glob.matches('test')).toBe(true);
      expect(glob.matches('testing')).toBe(true);
      expect(glob.matches('testable')).toBe(true);
      expect(glob.matches('best')).toBe(false);
    });

    it('should match star wildcard at the start', () => {
      // Arrange
      const glob = new Glob('*test');

      // Act & Assert
      expect(glob.matches('test')).toBe(true);
      expect(glob.matches('pretest')).toBe(true);
      expect(glob.matches('testing')).toBe(false);
    });

    it('should match star wildcard in the middle', () => {
      // Arrange
      const glob = new Glob('te*st');

      // Act & Assert
      expect(glob.matches('test')).toBe(true);
      expect(glob.matches('texst')).toBe(true);
      expect(glob.matches('te123st')).toBe(true);
      expect(glob.matches('text')).toBe(false);
    });

    it('should match multiple star wildcards', () => {
      // Arrange
      const glob = new Glob('*test*');

      // Act & Assert
      expect(glob.matches('test')).toBe(true);
      expect(glob.matches('atest')).toBe(true);
      expect(glob.matches('testb')).toBe(true);
      expect(glob.matches('atestb')).toBe(true);
    });

    it('should match global wildcard pattern to anything', () => {
      // Arrange
      const glob = new Glob('*');

      // Act & Assert
      expect(glob.matches('anything')).toBe(true);
      expect(glob.matches('else')).toBe(true);
      expect(glob.matches('')).toBe(true);
    });

    it('should match consecutive wildcards', () => {
      // Arrange
      const glob = new Glob('a**b');

      // Act & Assert
      expect(glob.matches('ab')).toBe(true);
      expect(glob.matches('axb')).toBe(true);
      expect(glob.matches('axxb')).toBe(true);
    });

    it('should handle empty pattern', () => {
      // Arrange
      const glob = new Glob('');

      // Act & Assert
      expect(glob.matches('')).toBe(true);
      expect(glob.matches('anything')).toBe(false);
    });

    // New tests for question mark wildcard
    it('should match question mark wildcard for exactly one character', () => {
      // Arrange
      const glob = new Glob('te?t');

      // Act & Assert
      expect(glob.matches('test')).toBe(true);
      expect(glob.matches('tent')).toBe(true);
      expect(glob.matches('tet')).toBe(false); // too short
      expect(glob.matches('teest')).toBe(false); // too long
    });

    it('should match multiple question marks', () => {
      // Arrange
      const glob = new Glob('???.js');

      // Act & Assert
      expect(glob.matches('app.js')).toBe(true);
      expect(glob.matches('log.js')).toBe(true);
      expect(glob.matches('a.js')).toBe(false); // too short
      expect(glob.matches('long.js')).toBe(false); // too long
    });

    it('should correctly combine star and question mark wildcards', () => {
      // Arrange
      const glob = new Glob('*te?t*');

      // Act & Assert
      expect(glob.matches('test')).toBe(true); // matches correctly
      expect(glob.matches('atestb')).toBe(true);
      expect(glob.matches('atextb')).toBe(true);
      expect(glob.matches('te')).toBe(false); // missing chars for the ?t part
      expect(glob.matches('tent')).toBe(true); // n matches the ?
      expect(glob.matches('tecct')).toBe(false); // too many chars for single ?
    });

    it('should match extension wildcards with question marks', () => {
      // Arrange
      const glob = new Glob('file.?s');

      // Act & Assert
      expect(glob.matches('file.js')).toBe(true);
      expect(glob.matches('file.ts')).toBe(true);
      expect(glob.matches('file.jsx')).toBe(false); // too long
      expect(glob.matches('file.j')).toBe(false); // too short
    });
  });

  describe('static matches', () => {
    it('should match in a single call', () => {
      // Arrange & Act & Assert
      expect(Glob.matches('test', 'test')).toBe(true);
      expect(Glob.matches('test', 'te*')).toBe(true);
      expect(Glob.matches('test', 'other')).toBe(false);
    });

    // New test for question mark with static method
    it('should match question mark patterns in static call', () => {
      // Arrange & Act & Assert
      expect(Glob.matches('test', 'te?t')).toBe(true);
      expect(Glob.matches('text', 'te?t')).toBe(true);
      expect(Glob.matches('tet', 'te?t')).toBe(false);
    });
  });

  describe('real-world examples', () => {
    it('should match tool patterns', () => {
      // Arrange
      const glob = new Glob('code-*');

      // Act & Assert
      expect(glob.matches('code-review')).toBe(true);
      expect(glob.matches('code-explain')).toBe(true);
      expect(glob.matches('summarize')).toBe(false);
    });

    it('should handle extension patterns', () => {
      // Arrange
      const glob = new Glob('*.ts');

      // Act & Assert
      expect(glob.matches('file.ts')).toBe(true);
      expect(glob.matches('module.test.ts')).toBe(true);
      expect(glob.matches('file.js')).toBe(false);
    });

    it('should match filenames with multiple extensions', () => {
      // Arrange
      const glob = new Glob('*.test.ts');

      // Act & Assert
      expect(glob.matches('component.test.ts')).toBe(true);
      expect(glob.matches('test.ts')).toBe(false);
      expect(glob.matches('component.spec.ts')).toBe(false);
    });

    // New real-world examples for question mark
    it('should match file extensions with fixed length', () => {
      // Arrange
      const glob = new Glob('*.??');

      // Act & Assert
      expect(glob.matches('file.js')).toBe(true);
      expect(glob.matches('file.ts')).toBe(true);
      expect(glob.matches('file.css')).toBe(false);
      expect(glob.matches('file.json')).toBe(false);
    });

    it('should match version numbers with fixed positions', () => {
      // Arrange
      const glob = new Glob('v1.?.?');

      // Act & Assert
      expect(glob.matches('v1.0.0')).toBe(true);
      expect(glob.matches('v1.2.3')).toBe(true);
      expect(glob.matches('v1.10.5')).toBe(false); // second number too long
      expect(glob.matches('v2.0.0')).toBe(false); // doesn't match version
    });
  });
});
