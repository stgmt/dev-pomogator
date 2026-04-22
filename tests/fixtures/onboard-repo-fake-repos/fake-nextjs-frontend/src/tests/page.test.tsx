import { describe, it, expect } from 'vitest';
import HomePage from '../app/page';


describe('HomePage', () => {
  it('renders without crashing', () => {
    const element = HomePage();
    expect(element).toBeDefined();
  });
});
