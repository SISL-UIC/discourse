import type { ComponentLike } from "@glint/template";
import DAG from "discourse/lib/dag";
import { isDevelopment, isTesting } from "discourse/lib/environment";

/** Returns a tool's component, or a module whose default export is one. */
type DevToolLoader = () => Promise<unknown>;

/** Where a tool sits relative to the others, by their identifiers. */
interface DevToolPosition {
  before?: string | string[];
  after?: string | string[];
}

/**
 * Registry of buttons shown in the developer tools toolbar.
 *
 * This module deliberately lives outside `discourse/static/dev-tools/`. That
 * directory contains the toolbar components and the developer tools
 * stylesheet, which are code-split into a chunk that is only fetched when
 * developer tools are enabled. Anything importing from there pulls that
 * module and its transitive imports into the importer's bundle, so keeping
 * the registry here lets eager code (such as the plugin API) reference it
 * without dragging the chunk along.
 *
 * @module discourse/lib/dev-tools/registry
 */

/**
 * The identifier of the last tool shipped with Discourse.
 *
 * Tools registered without an explicit position are placed after this one, so
 * that externally registered tools appear after the core set regardless of
 * when they register. See `resetDevTools` for why that matters.
 *
 * Exported so that the developer tools entrypoint and the tests share one
 * definition: a core tool added after this one would otherwise leave them
 * disagreeing about where the core set ends.
 */
export const LAST_CORE_TOOL = "verbose-localization";

let devTools: DAG;
resetDevTools();

/**
 * Creates an empty registry.
 *
 * Core tools are not seeded here. Their components live in the lazily loaded
 * developer tools chunk, so importing them would defeat the code splitting
 * described above. They are added by the chunk's entrypoint instead.
 *
 * That ordering is the reason for the default position. Application
 * initializers all run synchronously during boot, while the developer tools
 * chunk arrives later in a promise callback, so anything registered through
 * the plugin API is added *before* the core tools are. Defaulting to "after
 * the last core tool" keeps the core buttons in their usual place anyway.
 * The anchor does not exist yet at that point, which is fine: the underlying
 * DAG records the constraint against a placeholder and resolves it once the
 * real entry is added.
 */
function resetDevTools() {
  devTools = new DAG({ defaultPosition: { after: LAST_CORE_TOOL } });
}

/**
 * Returns the registry, for reading or for adding entries directly.
 *
 * Entries added here are held as-is, so a component passed to it is loaded by
 * whoever imported it. That suits the tools shipped with Discourse, whose
 * components are already inside the lazily loaded chunk, but not an external
 * registration; those go through `devToolsToolbarApi` instead.
 *
 * @returns The developer tools toolbar registry.
 */
export function devToolsDAG() {
  return devTools;
}

/**
 * Fetches a tool's component the first time the toolbar renders it.
 *
 * Registering a component directly would place it in the registrant's own
 * bundle, which is evaluated on every page load whether or not developer tools
 * are enabled. Holding a loader instead defers both the component and anything
 * it imports until the toolbar actually renders.
 */
class LazyDevTool {
  #loader: DevToolLoader;
  #component?: Promise<unknown>;

  constructor(loader: DevToolLoader) {
    this.#loader = loader;
  }

  /**
   * The tool's component.
   *
   * Cached on first read so that re-rendering the toolbar neither refetches
   * nor produces a new promise, which would send the rendered button back
   * through its loading state.
   *
   * @returns A promise for the component.
   */
  get component(): Promise<ComponentLike> {
    this.#component ??= this.#loader().then(
      (loaded) => (loaded as { default?: unknown })?.default ?? loaded
    );

    return this.#component as Promise<ComponentLike>;
  }
}

/**
 * Whether an entry's value must be awaited before it can be rendered.
 *
 * @param value - The value held against a registry entry.
 * @returns True when the value is a deferred tool.
 */
export function isLazyDevTool(value: unknown): value is LazyDevTool {
  return value instanceof LazyDevTool;
}

/**
 * Refuses a registration.
 *
 * Throwing would be the more useful signal, but developer tools can be turned
 * on against a production build, and a mistake in one tool must not take the
 * page down with it. So the failure is loud where it can be acted on and inert
 * everywhere else.
 */
function refuse(message: string) {
  if (isDevelopment() || isTesting()) {
    throw new Error(message);
  }

  // eslint-disable-next-line no-console
  console.warn(`[DevTools] ${message}`);
}

/**
 * The developer tools toolbar as it is offered to external code.
 *
 * Deliberately narrower than the registry behind it. Only adding is exposed:
 * removing or repositioning an entry would mean reaching into tools belonging
 * to Discourse or to another plugin, which is not a registrant's concern. And
 * only a loader is accepted, so that a tool cannot be registered in a way that
 * costs every page load.
 */
class DevToolsToolbarApi {
  /**
   * Adds a tool to the toolbar.
   *
   * @param id - Identifier for the tool, also what other entries position
   *   themselves against.
   * @param loader - Returns the tool's component, or a module whose default
   *   export is the component. Typically `() => import("...")`.
   * @param position - Where the tool sits relative to others. Defaults to
   *   after the tools shipped with Discourse.
   */
  add(id: string, loader: DevToolLoader, position?: DevToolPosition) {
    if (typeof loader !== "function") {
      return refuse(
        `The tool "${id}" was registered with a ${typeof loader} instead of a loader. ` +
          `Pass a function returning the component, such as () => import("..."), ` +
          `so that it is only fetched when developer tools are enabled.`
      );
    }

    if (devTools.has(id)) {
      return refuse(
        `A tool is already registered as "${id}". Identifiers are shared across ` +
          `Discourse and every plugin, so pick one unlikely to collide.`
      );
    }

    devTools.add(id, new LazyDevTool(loader), position);
  }
}

/**
 * Returns the toolbar API handed to plugins.
 *
 * @returns The narrowed toolbar interface.
 */
export function devToolsToolbarApi() {
  return new DevToolsToolbarApi();
}

/**
 * Empties the registry.
 *
 * Intended for tests. Registration happens once per application boot, and the
 * test suite creates a fresh application per test, so without this the
 * registry would accumulate entries across tests.
 */
export function clearDevTools() {
  resetDevTools();
}
