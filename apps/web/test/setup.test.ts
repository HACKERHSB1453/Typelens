import { describe, expect, it } from 'vitest';
import { detectBrowser, firefoxFolder } from '../src/pages/SetupPage';

describe('setup guide', () => {
  it('picks the browser tab from the user agent', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
    expect(detectBrowser(chrome)).toBe('chrome');
    expect(detectBrowser(chrome, true)).toBe('brave');
    expect(detectBrowser(`${chrome} Edg/130.0`)).toBe('edge');
    expect(detectBrowser(`${chrome} OPR/115.0`)).toBe('opera');
    expect(detectBrowser(`${chrome} Vivaldi/7.0`)).toBe('vivaldi');
    expect(detectBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('firefox');
  });
  it('finds the Firefox folder next to the Chromium one', () => {
    expect(firefoxFolder('/opt/TypeLens/resources/extension')).toBe('/opt/TypeLens/resources/extension-firefox');
    expect(firefoxFolder('C:\\Users\\a\\AppData\\Local\\Programs\\TypeLens\\resources\\extension')).toBe(
      'C:\\Users\\a\\AppData\\Local\\Programs\\TypeLens\\resources\\extension-firefox',
    );
    expect(firefoxFolder('/home/a/Typelens/apps/extension/dist')).toBe('/home/a/Typelens/apps/extension/dist-firefox');
    expect(firefoxFolder('/somewhere/else')).toBeNull();
    expect(firefoxFolder(null)).toBeNull();
  });
});
