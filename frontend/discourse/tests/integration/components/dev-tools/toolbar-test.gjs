import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import {
  clearDevTools,
  devToolsDAG,
  devToolsToolbarApi,
} from "discourse/lib/dev-tools/registry";
import Toolbar from "discourse/static/dev-tools/toolbar";
import { setupRenderingTest } from "discourse/tests/helpers/component-test";

const First = <template>
  <button type="button" class="first-tool"></button>
</template>;
const Second = <template>
  <button type="button" class="second-tool"></button>
</template>;
const Lazy = <template>
  <button type="button" class="lazy-tool"></button>
</template>;

function toolClasses() {
  return [...document.querySelectorAll(".dev-tools-toolbar > *")].map(
    (element) => element.className
  );
}

module("Integration | Component | dev-tools | toolbar", function (hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function () {
    clearDevTools();
  });

  test("renders registered tools between the gripper and the disable button", async function (assert) {
    devToolsDAG().add("first", First);
    devToolsDAG().add("second", Second, { after: "first" });

    await render(<template><Toolbar /></template>);

    assert.dom(".dev-tools-toolbar .first-tool").exists();
    assert.dom(".dev-tools-toolbar .second-tool").exists();

    const classes = [
      ...document.querySelectorAll(".dev-tools-toolbar > *"),
    ].map((element) => element.className);

    assert.deepEqual(
      classes,
      ["gripper", "first-tool", "second-tool", "disable-dev-tools"],
      "tools render in registry order, between the gripper and the disable button"
    );
  });

  test("renders only the gripper and the disable button when no tools are registered", async function (assert) {
    await render(<template><Toolbar /></template>);

    assert.dom(".dev-tools-toolbar").exists("the toolbar itself still renders");
    assert.dom(".dev-tools-toolbar .gripper").exists();
    assert.dom(".dev-tools-toolbar .disable-dev-tools").exists();
  });

  test("an externally registered tool is fetched and takes its declared position", async function (assert) {
    devToolsDAG().add("first", First);
    devToolsToolbarApi().add("lazy", async () => ({ default: Lazy }), {
      before: "first",
    });

    await render(<template><Toolbar /></template>);

    assert.dom(".dev-tools-toolbar .lazy-tool").exists("the tool is rendered");
    assert.deepEqual(
      toolClasses(),
      ["gripper", "lazy-tool", "first-tool", "disable-dev-tools"],
      "ordering is honoured even though the component was not loaded when it was registered"
    );
  });

  test("a loader returning the component synchronously is accepted", async function (assert) {
    devToolsToolbarApi().add("lazy", () => Lazy);

    await render(<template><Toolbar /></template>);

    assert
      .dom(".dev-tools-toolbar .lazy-tool")
      .exists("the synchronously returned component renders");
  });

  test("a tool is fetched once no matter how often the toolbar re-renders", async function (assert) {
    let loads = 0;

    devToolsToolbarApi().add("lazy", async () => {
      loads++;
      return Lazy;
    });

    await render(<template><Toolbar /></template>);

    assert.strictEqual(loads, 1, "the loader ran once");

    // Re-reading the entry must not produce a new promise, which would send the
    // rendered button back through its loading state.
    await render(<template><Toolbar /></template>);

    assert.strictEqual(loads, 1, "re-rendering does not refetch");
  });

  test("a tool that fails to load leaves the rest of the toolbar intact", async function (assert) {
    devToolsDAG().add("first", First);
    devToolsToolbarApi().add("broken", async () => {
      throw new Error("chunk unavailable");
    });

    await render(<template><Toolbar /></template>);

    assert.deepEqual(
      toolClasses(),
      ["gripper", "first-tool", "disable-dev-tools"],
      "the broken tool is skipped and the working one still renders"
    );
  });

  test("a tool whose loader throws synchronously leaves the rest of the toolbar intact", async function (assert) {
    devToolsDAG().add("first", First);
    devToolsToolbarApi().add("broken", () => {
      throw new Error("loader failed before returning a promise");
    });

    await render(<template><Toolbar /></template>);

    assert.deepEqual(
      toolClasses(),
      ["gripper", "first-tool", "disable-dev-tools"],
      "the broken tool is skipped and the working one still renders"
    );
  });

  test("registering without a loader or under a taken identifier is refused", async function (assert) {
    devToolsToolbarApi().add("taken", async () => Lazy);

    assert.throws(
      () => devToolsToolbarApi().add("eager", Lazy),
      /instead of a loader/,
      "a component cannot be registered directly, since it would cost every page load"
    );
    assert.throws(
      () => devToolsToolbarApi().add("taken", async () => First),
      /already registered/,
      "a colliding identifier is reported rather than silently ignored"
    );

    await render(<template><Toolbar /></template>);

    assert.deepEqual(
      toolClasses(),
      ["gripper", "lazy-tool", "disable-dev-tools"],
      "neither refused registration reached the toolbar"
    );
  });
});
