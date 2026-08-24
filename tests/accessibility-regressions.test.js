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
const helpersJs = read('app/js/utils/helpers.js');
const characterJs = read('app/js/ui/screens/character.js');
const inventoryJs = read('app/js/ui/screens/inventory.js');
const guildJs = read('app/js/ui/screens/guild.js');
const developersJs = read('app/js/ui/screens/developers.js');
const helpJs = read('app/js/ui/screens/help.js');

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

test('paid secret library uses labeled regions, buttons, live status, and focus handoff', function () {
  const help = read('app/js/ui/screens/help.js');
  const css = read('app/css/main.css');
  assert.ok(/help-secret-library[\s\S]*aria-labelledby="help-secret-library-title"/.test(help), 'secret library should be a labeled region');
  assert.ok(/id="help-secret-library-title" tabindex="-1"/.test(help), 'secret library heading should receive focus after unlock');
  assert.ok(/help-secret-library-status[\s\S]*role="status" aria-live="polite"/.test(help), 'unlock status should be announced politely');
  assert.ok(/type="button" class="btn btn-primary" id="help-secret-library-unlock"/.test(help), 'locked chapter entry should be a real button');
  assert.ok(/unlock\.addEventListener\('click', _unlockSecretLibrary\)/.test(help), 'the labeled room button should launch the single-step payment flow directly');
  assert.ok(/confirm\.setAttribute\('aria-busy', 'true'\)/.test(help) && /help_secret_library_waiting_confirmation/.test(help), 'the same button should expose busy state while payment proof is pending');
  assert.ok(/type="button" class="help-library-link help-secret-library-link"/.test(help), 'secret map entries should remain keyboard-operable buttons');
  assert.ok(/\.help-secret-library-link[\s\S]*min-height:\s*44px[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(css), 'secret map buttons should have 44px touch targets and wrap without mobile overflow');
});

test('Creators book has ordered headings, labeled pages, and keyboard-safe external links', function () {
  assert.ok(/setAttribute\('aria-label', t\('developers_title'\)\)/.test(developersJs), 'creator route label should follow the selected language');
  assert.ok(/aria-labelledby="creators-book-title"/.test(developersJs), 'creator book should be named by its visible heading');
  assert.ok(/id="creators-book-title"/.test(developersJs), 'creator book title id should exist');
  assert.ok(/aria-labelledby="creators-denis-title"/.test(developersJs) && /aria-labelledby="creators-evgeny-title"/.test(developersJs), 'both creator pages should be labelled by headings');
  assert.ok(/titleId = 'creators-reward-' \+ creator\.id/.test(developersJs) && /class="creators-page-gratitude" aria-labelledby="' \+ titleId/.test(developersJs), 'each rendered gratitude seal should be a uniquely labelled subsection');
  assert.ok(/creators-custom-energy-' \+ creator\.id/.test(developersJs), 'creator reward inputs should have unique ids');
  assert.ok(/if \(!creator\.account\) return ''/.test(developersJs), 'creator without an account should expose no empty reward controls');
  assert.ok(/target="_blank" rel="noopener noreferrer"/.test(developersJs), 'external links should be isolated safely');
  assert.ok(/\.creators-link[\s\S]*min-height:\s*44px[\s\S]*overflow-wrap:\s*anywhere/.test(mainCss), 'creator links should meet touch size and wrapping requirements');
  assert.ok(/\.creators-link:focus-visible/.test(mainCss), 'creator links should expose a visible keyboard focus state');
});

test('Unknown Maps chapter and Fading Path are labelled without hiding the red warning', function () {
  assert.ok(/help-unknown-library[^>]*aria-labelledby="help-unknown-library-title"/.test(helpJs), 'chapter three article should be named by its visible heading');
  assert.ok(/id="help-unknown-library-title" tabindex="-1"/.test(helpJs), 'chapter heading should accept programmatic focus after unlock');
  assert.ok(/class="help-library-danger"/.test(helpJs) && !/help-library-danger[^>]*aria-hidden/.test(helpJs), 'danger warning should remain exposed to screen readers');
  assert.ok(/\.help-library-danger\s*\{[\s\S]*color:\s*#ff6159\s*!important/.test(mainCss), 'danger warning should have an explicit red color');
  assert.ok(/<hr class="help-unknown-library-divider">[\s\S]*id="help-unknown-library-fading-title"[\s\S]*role="group" aria-labelledby="help-unknown-library-fading-title"/.test(helpJs), 'Fading Path should be separated and label its final button group');
  assert.ok(/\.help-secret-library-link[\s\S]*min-height:\s*44px/.test(mainCss), 'unknown map links should inherit 44px touch targets');
});

test('core screen fallbacks avoid blank controls and fixture crashes', function () {
  assert.ok(/typeof num === 'undefined'/.test(helpersJs), 'formatNumber should tolerate missing numeric values');
  assert.ok(/ch\.coreBonus = ch\.coreBonus \|\| 0/.test(characterJs), 'character screen should default missing coreBonus');
  assert.ok(/ch\.spells = ch\.spells \|\| \[\]/.test(characterJs), 'character screen should default missing spells');
  assert.ok(/id="inv-compact"[\s\S]*aria-label=/.test(inventoryJs), 'inventory compact switch needs an accessible name');
  assert.ok(/id="input-active-key"[\s\S]*aria-label=/.test(guildJs), 'guild active key input needs an accessible name for TalkBack');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
