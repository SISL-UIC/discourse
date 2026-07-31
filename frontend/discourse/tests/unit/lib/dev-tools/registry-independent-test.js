import { setupTest } from "ember-qunit";
import { module, test } from "qunit";
import {
  clearDevTools,
  CORE_TOOL_IDS,
  devToolsDAG,
  devToolsToolbarApi,
  LAST_CORE_TOOL,
} from "discourse/lib/dev-tools/registry";

function registerCoreTools(registry, componentFor = (id) => id) {
  let previous;

  for (const id of CORE_TOOL_IDS) {
    registry.add(id, componentFor(id), previous ? { after: previous } : {});
    previous = id;
  }
}

module("Unit | Lib | dev-tools | registry independent", function (hooks) {
  setupTest(hooks);

  hooks.afterEach(function () {
    clearDevTools();
  });

  test("registrations made before late core seeding survive without disturbing core order", function (assert) {
    const registry = devToolsDAG();
    const defaultPluginComponent = {};
    const positionedPluginComponent = {};

    registry.add("plugin-default", defaultPluginComponent);
    registry.add("plugin-before-block", positionedPluginComponent, {
      before: "block-debug",
    });
    registerCoreTools(registry);

    const resolved = registry.resolve();
    const resolvedKeys = resolved.map(({ key }) => key);

    assert.deepEqual(
      resolvedKeys.filter((key) => CORE_TOOL_IDS.includes(key)),
      CORE_TOOL_IDS,
      "late core registrations retain their required relative order"
    );
    assert.true(
      resolvedKeys.includes("plugin-default"),
      "a default-positioned early plugin registration survives"
    );
    assert.true(
      resolvedKeys.includes("plugin-before-block"),
      "an explicitly positioned early plugin registration survives"
    );
    assert.true(
      resolvedKeys.indexOf("plugin-default") >
        resolvedKeys.indexOf(LAST_CORE_TOOL),
      "the unresolved default anchor places the plugin after all core tools once seeded"
    );
    assert.true(
      resolvedKeys.indexOf("plugin-before-block") <
        resolvedKeys.indexOf("block-debug"),
      "an early constraint against a not-yet-registered core tool is honored"
    );
  });

  test("repeating core seeding is a no-op and does not erase plugin entries", function (assert) {
    const registry = devToolsDAG();
    const originalComponents = new Map(
      CORE_TOOL_IDS.map((id) => [id, { source: `original-${id}` }])
    );

    registry.add("plugin-tool", { source: "plugin" });
    registerCoreTools(registry, (id) => originalComponents.get(id));
    registerCoreTools(registry, (id) => ({ source: `replacement-${id}` }));

    const resolved = registry.resolve();

    assert.deepEqual(
      resolved.map(({ key }) => key),
      [...CORE_TOOL_IDS, "plugin-tool"],
      "idempotent seeding neither duplicates core entries nor removes the plugin"
    );

    for (const id of CORE_TOOL_IDS) {
      assert.strictEqual(
        resolved.find(({ key }) => key === id).value,
        originalComponents.get(id),
        `${id} keeps the component from the first seed`
      );
    }
  });

  test("external registrations cannot use core identifiers", function (assert) {
    for (const id of CORE_TOOL_IDS) {
      assert.throws(
        () => devToolsToolbarApi().add(id, async () => id),
        /already registered/,
        `${id} is reserved for its core tool`
      );
    }

    assert.deepEqual(
      devToolsDAG().resolve(),
      [],
      "refused registrations do not reach the registry"
    );
  });

  test("cyclic external positions fall back without losing either tool", function (assert) {
    devToolsToolbarApi().add("first", async () => "first", {
      after: "second",
    });

    let error;
    try {
      devToolsToolbarApi().add("second", async () => "second", {
        after: "first",
      });
    } catch (caught) {
      error = caught;
    }

    assert.strictEqual(
      error,
      undefined,
      "closing a positioning cycle does not throw"
    );
    assert.deepEqual(
      devToolsDAG()
        .resolve()
        .map(({ key }) => key),
      ["second", "first"],
      "the conflicting tool uses the default position and both tools remain registered"
    );
  });
});
