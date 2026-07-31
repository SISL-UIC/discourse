import { setupTest } from "ember-qunit";
import { module, test } from "qunit";
import {
  clearDevTools,
  devToolsDAG,
  LAST_CORE_TOOL,
} from "discourse/lib/dev-tools/registry";

const CORE_TOOL_IDS = [
  "plugin-outlet-debug",
  "block-debug",
  "upcoming-changes-debug",
  "safe-mode",
  LAST_CORE_TOOL,
];

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
});
