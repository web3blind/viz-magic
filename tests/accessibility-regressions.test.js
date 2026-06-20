const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

const manifest = JSON.parse(read('app/manifest.json'));
const indexHtml = read('app/index.html');
const appJs = read('app/js/ui/app.js');
const a11yJs = read('app/js/utils/a11y.js');
const modalJs = read('app/js/ui/components/modal.js');
const navJs = read('app/js/ui/components/nav.js');
const huntJs = read('app/js/ui/screens/hunt.js');
const onboardingJs = read('app/js/ui/screens/onboarding.js');
const settingsJs = read('app/js/ui/screens/settings.js');
const accessibilityCss = read('app/css/accessibility.css');
const mainCss = read('app/css/main.css');

test('manifest does not lock orientation', function () {
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'orientation'), 'orientation lock should be removed');
});

test('app shell exposes skip link before main content', function () {
  assert.ok(indexHtml.includes('class="skip-link"'), 'skip link class missing');
  assert.ok(indexHtml.includes('href="#app-main"'), 'skip link target should point to #app-main');
  assert.ok(indexHtml.includes('id="app-main"'), 'app-main target missing');
});

test('screen navigation includes explicit focus handoff', function () {
  assert.ok(/_moveFocusToScreen\s*\(/.test(appJs), 'screen focus helper missing');
  assert.ok(/_moveFocusToScreen\(target, screenId\)/.test(appJs), 'navigateTo should move focus to active screen');
});

test('a11y helpers expose keyboard support for radio groups', function () {
  assert.ok(/function bindRadioGroup\(/.test(a11yJs), 'bindRadioGroup helper missing');
  assert.ok(/ArrowRight|ArrowDown|ArrowLeft|ArrowUp/.test(a11yJs), 'radio group helper should support arrow keys');
});

test('modal component applies dialog semantics and focus restoration', function () {
  assert.ok(/role', 'dialog'|role="dialog"/.test(modalJs), 'dialog role missing');
  assert.ok(/aria-modal/.test(modalJs), 'aria-modal missing');
  assert.ok(/lastFocusedElement|restoreFocus/.test(modalJs), 'focus restoration missing');
});

test('bottom navigation uses navigation semantics instead of fake tabs', function () {
  assert.ok(!/role="tab"/.test(navJs), 'nav should not expose tab role');
  assert.ok(/aria-current=/.test(navJs) || /aria-current"/.test(navJs), 'nav should expose aria-current for active destination');
});

test('hunt and onboarding screens use shared keyboard radio-group binding', function () {
  assert.ok(/A11y\.bindRadioGroup/.test(huntJs), 'hunt screen should use bindRadioGroup');
  assert.ok(/A11y\.bindRadioGroup/.test(onboardingJs), 'onboarding screen should use bindRadioGroup');
});

test('settings accessibility toggles map to persistent DOM hooks', function () {
  assert.ok(/setAttribute\('data-theme', 'high-contrast'\)|setAttribute\("data-theme", "high-contrast"\)/.test(settingsJs), 'high contrast should map to data-theme hook');
  assert.ok(/viz_magic_reduced_motion|STORAGE_PREFIX \+ 'reduced_motion'/.test(settingsJs), 'reduced motion preference should be persisted');
  assert.ok(/\.high-contrast|\[data-theme="high-contrast"\]/.test(accessibilityCss), 'high contrast CSS hook missing');
  assert.ok(/\.reduced-motion/.test(accessibilityCss), 'reduced motion class hook missing');
});

test('skip link styles are present', function () {
  assert.ok(/\.skip-link/.test(mainCss), 'skip-link CSS missing');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
