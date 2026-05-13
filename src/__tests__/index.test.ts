import { describe, expect, it } from 'vitest';
import { VERSION } from '../index';

describe('VERSION', () => {
  it('セマンティックバージョン形式である', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
