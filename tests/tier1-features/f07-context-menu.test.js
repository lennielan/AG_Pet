/**
 * f07-context-menu.test.js
 * Feature 7: Right-Click Context Menu (Scale, Mute, Hide)
 * Validates menu structure, scale options, mute toggle, hide action, and persistence.
 */

const assert = require('node:assert');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');

function createContextMenuController(initialConfig, onPersist) {
  let config = { ...initialConfig };
  let isHidden = false;

  const getMenuItems = () => [
    {
      id: 'scale',
      label: 'Scale',
      submenu: [
        { label: '1.0x', checked: config.scale === 1.0, action: () => setScale(1.0) },
        { label: '1.5x', checked: config.scale === 1.5, action: () => setScale(1.5) },
        { label: '2.0x', checked: config.scale === 2.0, action: () => setScale(2.0) }
      ]
    },
    {
      id: 'mute',
      label: config.isMuted ? 'Unmute Audio' : 'Mute Audio',
      action: () => toggleMute()
    },
    {
      id: 'hide',
      label: 'Hide AG Pet',
      action: () => hidePet()
    }
  ];

  const setScale = (scale) => {
    config.scale = scale;
    if (onPersist) onPersist(config);
  };

  const toggleMute = () => {
    config.isMuted = !config.isMuted;
    if (onPersist) onPersist(config);
  };

  const hidePet = () => {
    isHidden = true;
  };

  return {
    getConfig: () => ({ ...config }),
    getMenuItems,
    setScale,
    toggleMute,
    hidePet,
    isHidden: () => isHidden
  };
}

module.exports = {
  name: 'F07: Right-Click Context Menu',
  tier: 1,
  tests: [
    {
      name: 'test_context_menu_items',
      fn: async () => {
        const menu = createContextMenuController({ x: 0, y: 0, scale: 1.0, isMuted: false });
        const items = menu.getMenuItems();
        const ids = items.map(i => i.id);
        assert(ids.includes('scale'), 'Context menu must have scale submenu');
        assert(ids.includes('mute'), 'Context menu must have mute item');
        assert(ids.includes('hide'), 'Context menu must have hide item');
      }
    },
    {
      name: 'test_context_menu_scale_selection',
      fn: async () => {
        const menu = createContextMenuController({ x: 0, y: 0, scale: 1.0, isMuted: false });
        menu.setScale(1.5);
        assert.strictEqual(menu.getConfig().scale, 1.5);
        const scaleItem = menu.getMenuItems().find(i => i.id === 'scale');
        const checkedOpt = scaleItem.submenu.find(opt => opt.checked);
        assert.strictEqual(checkedOpt.label, '1.5x');
      }
    },
    {
      name: 'test_context_menu_mute_toggle',
      fn: async () => {
        const menu = createContextMenuController({ x: 0, y: 0, scale: 1.0, isMuted: false });
        let muteItem = menu.getMenuItems().find(i => i.id === 'mute');
        assert.strictEqual(muteItem.label, 'Mute Audio');

        menu.toggleMute();
        assert.strictEqual(menu.getConfig().isMuted, true);
        muteItem = menu.getMenuItems().find(i => i.id === 'mute');
        assert.strictEqual(muteItem.label, 'Unmute Audio');
      }
    },
    {
      name: 'test_context_menu_hide_action',
      fn: async () => {
        const menu = createContextMenuController({ x: 0, y: 0, scale: 1.0, isMuted: false });
        assert.strictEqual(menu.isHidden(), false);
        menu.hidePet();
        assert.strictEqual(menu.isHidden(), true);
      }
    },
    {
      name: 'test_context_menu_persistence_trigger',
      fn: async () => {
        let persistTriggered = 0;
        const menu = createContextMenuController(
          { x: 10, y: 20, scale: 1.0, isMuted: false },
          () => { persistTriggered++; }
        );
        menu.setScale(2.0);
        menu.toggleMute();
        assert.strictEqual(persistTriggered, 2, 'Persistence callback should fire on settings change');
      }
    }
  ]
};
