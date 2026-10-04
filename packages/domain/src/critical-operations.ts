import type { AppState } from "./types";
import { normalizeOperationalState } from "./runtime-state";

export type CriticalOperationKind =
  | "order.item.add"
  | "order.item.update"
  | "order.item.remove"
  | "order.course.wait"
  | "order.course.skip"
  | "order.send"
  | "order.payment"
  | "order.cancellation"
  | "order.close"
  | "order.delete"
  | "order.receipt"
  | "order.party-group"
  | "table.create"
  | "table.update"
  | "table.link"
  | "table.unlink"
  | "kitchen.status"
  | "bar.status"
  | "staff.create"
  | "staff.update"
  | "staff.delete"
  | "staff.handover"
  | "staff.handover.undo"
  | "catalog.create"
  | "catalog.update"
  | "catalog.delete"
  | "settings.update"
  | "notification.update"
  | "daily.reset"
  | "daily.reset.undo"
  | "print.enqueue"
  | "state.reset"
  | "state.update";

export type StatePatchPathSegment = string | { id: string };
export type StatePatchPath = StatePatchPathSegment[];

export type StatePatch =
  | {
      op: "set";
      path: StatePatchPath;
      hadValue: boolean;
      before?: unknown;
      value: unknown;
    }
  | {
      op: "delete";
      path: StatePatchPath;
      before: unknown;
    }
  | {
      op: "array-insert";
      path: StatePatchPath;
      id: string;
      index: number;
      value: unknown;
    }
  | {
      op: "array-remove";
      path: StatePatchPath;
      id: string;
      before: unknown;
    }
  | {
      op: "array-reorder";
      path: StatePatchPath;
      beforeIds: string[];
      ids: string[];
    };

export type CriticalOperation = {
  type: "state.patch";
  kind: CriticalOperationKind;
  patches: StatePatch[];
};

export type CriticalPrintJob = {
  transactionId: string;
  request: unknown;
};

export type CriticalTransactionRequest = {
  transactionId: string;
  deviceId: string;
  actorId?: string;
  createdAt: string;
  operation: CriticalOperation;
  printJobs?: CriticalPrintJob[];
};

export type CriticalTransactionConfirmation<TResult = unknown> = {
  success: true;
  transactionId: string;
  serverId: string;
  savedAt: string;
  status: "confirmed";
  stateVersion: number;
  state: AppState;
  result?: TResult;
};

export class CriticalOperationConflictError extends Error {
  constructor(
    message: string,
    readonly path: StatePatchPath
  ) {
    super(message);
    this.name = "CriticalOperationConflictError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isIdentifiedRecordArray = (
  value: unknown[]
): value is Array<Record<string, unknown> & { id: string }> => {
  if (value.length === 0) return false;

  const ids = new Set<string>();
  return value.every((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry["id"] !== "string" ||
      entry["id"].length === 0
    ) {
      return false;
    }
    if (ids.has(entry["id"])) return false;
    ids.add(entry["id"]);
    return true;
  });
};

const valuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const cloneValue = <T>(value: T): T => structuredClone(value);

const createPatches = (
  before: unknown,
  after: unknown,
  path: StatePatchPath,
  patches: StatePatch[]
) => {
  if (valuesEqual(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    if (isIdentifiedRecordArray(before) && isIdentifiedRecordArray(after)) {
      const beforeById = new Map(before.map((entry) => [entry["id"], entry]));
      const afterById = new Map(after.map((entry) => [entry["id"], entry]));

      before.forEach((entry) => {
        if (!afterById.has(entry["id"])) {
          patches.push({
            op: "array-remove",
            path: cloneValue(path),
            id: entry["id"],
            before: cloneValue(entry)
          });
        }
      });

      after.forEach((entry, index) => {
        const previous = beforeById.get(entry["id"]);
        if (!previous) {
          patches.push({
            op: "array-insert",
            path: cloneValue(path),
            id: entry["id"],
            index,
            value: cloneValue(entry)
          });
          return;
        }

        createPatches(previous, entry, [...path, { id: entry["id"] }], patches);
      });

      const beforeIds = before
        .map((entry) => entry["id"])
        .filter((id) => afterById.has(id));
      const afterIds = after
        .map((entry) => entry["id"])
        .filter((id) => beforeById.has(id));
      if (!valuesEqual(beforeIds, afterIds)) {
        patches.push({
          op: "array-reorder",
          path: cloneValue(path),
          beforeIds,
          ids: afterIds
        });
      }
      return;
    }

    patches.push({
      op: "set",
      path: cloneValue(path),
      hadValue: true,
      before: cloneValue(before),
      value: cloneValue(after)
    });
    return;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((key) => {
      const hadBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);

      if (!hasAfter) {
        patches.push({
          op: "delete",
          path: [...path, key],
          before: cloneValue(before[key])
        });
        return;
      }

      if (!hadBefore) {
        patches.push({
          op: "set",
          path: [...path, key],
          hadValue: false,
          value: cloneValue(after[key])
        });
        return;
      }

      createPatches(before[key], after[key], [...path, key], patches);
    });
    return;
  }

  patches.push({
    op: "set",
    path: cloneValue(path),
    hadValue: before !== undefined,
    before: before === undefined ? undefined : cloneValue(before),
    value: cloneValue(after)
  });
};

export const createCriticalOperation = (
  before: AppState,
  after: AppState,
  kind: CriticalOperationKind = "state.update"
): CriticalOperation => {
  const patches: StatePatch[] = [];
  createPatches(
    before,
    after,
    [],
    patches
  );

  return {
    type: "state.patch",
    kind,
    patches
  };
};

type ResolvedPath = {
  parent: unknown;
  key: string | number | undefined;
  exists: boolean;
  value: unknown;
};

const formatPath = (path: StatePatchPath) =>
  path
    .map((segment) => (typeof segment === "string" ? segment : `[id=${segment.id}]`))
    .join(".");

const resolvePath = (root: unknown, path: StatePatchPath): ResolvedPath => {
  if (path.length === 0) {
    return {
      parent: undefined,
      key: undefined,
      exists: true,
      value: root
    };
  }

  let current: unknown = root;
  let parent: unknown;
  let key: string | number | undefined;

  for (const segment of path) {
    parent = current;

    if (typeof segment === "string") {
      if (!isRecord(current) && !Array.isArray(current)) {
        return { parent, key: segment, exists: false, value: undefined };
      }
      key = segment;
      const container = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(container, segment)) {
        return { parent, key, exists: false, value: undefined };
      }
      current = container[segment];
      continue;
    }

    if (!Array.isArray(current)) {
      return { parent, key: undefined, exists: false, value: undefined };
    }
    const index = current.findIndex(
      (entry) => isRecord(entry) && entry["id"] === segment.id
    );
    if (index < 0) {
      return { parent: current, key: undefined, exists: false, value: undefined };
    }
    key = index;
    current = current[index];
  }

  return {
    parent,
    key,
    exists: true,
    value: current
  };
};

const requireArrayAtPath = (root: unknown, path: StatePatchPath) => {
  const resolved = resolvePath(root, path);
  if (!resolved.exists || !Array.isArray(resolved.value)) {
    throw new CriticalOperationConflictError(
      `Array am Pfad ${formatPath(path)} wurde nicht gefunden.`,
      path
    );
  }
  return resolved.value;
};

const assignResolvedValue = (
  rootHolder: { value: unknown },
  resolved: ResolvedPath,
  value: unknown
) => {
  if (resolved.key === undefined) {
    rootHolder.value = value;
    return;
  }

  if (Array.isArray(resolved.parent) && typeof resolved.key === "number") {
    resolved.parent[resolved.key] = value;
    return;
  }

  (resolved.parent as Record<string, unknown>)[String(resolved.key)] = value;
};

const deleteResolvedValue = (resolved: ResolvedPath) => {
  if (resolved.key === undefined) {
    throw new CriticalOperationConflictError(
      "Der gesamte Zustand kann nicht über einen Lösch-Patch entfernt werden.",
      []
    );
  }

  if (Array.isArray(resolved.parent) && typeof resolved.key === "number") {
    resolved.parent.splice(resolved.key, 1);
    return;
  }

  delete (resolved.parent as Record<string, unknown>)[String(resolved.key)];
};

export const applyCriticalOperation = (
  state: AppState,
  operation: CriticalOperation
): AppState => {
  if (operation.type !== "state.patch") {
    throw new Error("Unbekannter Operationstyp.");
  }

  const rootHolder: { value: unknown } = {
    value: cloneValue(state)
  };

  operation.patches.forEach((patch) => {
    if (patch.op === "array-insert") {
      const target = requireArrayAtPath(rootHolder.value, patch.path);
      const existing = target.find(
        (entry) => isRecord(entry) && entry["id"] === patch.id
      );
      if (existing) {
        throw new CriticalOperationConflictError(
          `Datensatz ${patch.id} existiert bereits.`,
          patch.path
        );
      }
      target.splice(
        Math.max(0, Math.min(target.length, patch.index)),
        0,
        cloneValue(patch.value)
      );
      return;
    }

    if (patch.op === "array-remove") {
      const target = requireArrayAtPath(rootHolder.value, patch.path);
      const index = target.findIndex(
        (entry) => isRecord(entry) && entry["id"] === patch.id
      );
      if (index < 0 || !valuesEqual(target[index], patch.before)) {
        throw new CriticalOperationConflictError(
          `Datensatz ${patch.id} wurde zwischenzeitlich geändert.`,
          [...patch.path, { id: patch.id }]
        );
      }
      target.splice(index, 1);
      return;
    }

    if (patch.op === "array-reorder") {
      const target = requireArrayAtPath(rootHolder.value, patch.path);
      const currentIds = target
        .filter(isRecord)
        .map((entry) => entry["id"])
        .filter((id): id is string => typeof id === "string" && patch.ids.includes(id));
      if (!valuesEqual(currentIds, patch.beforeIds)) {
        throw new CriticalOperationConflictError(
          `Reihenfolge am Pfad ${formatPath(patch.path)} wurde zwischenzeitlich geändert.`,
          patch.path
        );
      }
      const order = new Map(patch.ids.map((id, index) => [id, index]));
      target.sort((left, right) => {
        const leftId =
          isRecord(left) && typeof left["id"] === "string" ? left["id"] : "";
        const rightId =
          isRecord(right) && typeof right["id"] === "string" ? right["id"] : "";
        const leftOrder = order.get(leftId);
        const rightOrder = order.get(rightId);
        if (leftOrder === undefined || rightOrder === undefined) return 0;
        return leftOrder - rightOrder;
      });
      return;
    }

    const resolved = resolvePath(rootHolder.value, patch.path);

    if (patch.op === "delete") {
      if (!resolved.exists || !valuesEqual(resolved.value, patch.before)) {
        throw new CriticalOperationConflictError(
          `Wert am Pfad ${formatPath(patch.path)} wurde zwischenzeitlich geändert.`,
          patch.path
        );
      }
      deleteResolvedValue(resolved);
      return;
    }

    if (patch.hadValue !== resolved.exists) {
      throw new CriticalOperationConflictError(
        `Existenz am Pfad ${formatPath(patch.path)} stimmt nicht mehr überein.`,
        patch.path
      );
    }
    if (patch.hadValue && !valuesEqual(resolved.value, patch.before)) {
      throw new CriticalOperationConflictError(
        `Wert am Pfad ${formatPath(patch.path)} wurde zwischenzeitlich geändert.`,
        patch.path
      );
    }

    if (!resolved.exists && patch.path.length > 0) {
      const parentPath = patch.path.slice(0, -1);
      const parent = resolvePath(rootHolder.value, parentPath);
      const finalSegment = patch.path.at(-1);
      if (
        !parent.exists ||
        !isRecord(parent.value) ||
        typeof finalSegment !== "string"
      ) {
        throw new CriticalOperationConflictError(
          `Ziel am Pfad ${formatPath(patch.path)} wurde nicht gefunden.`,
          patch.path
        );
      }
      parent.value[finalSegment] = cloneValue(patch.value);
      return;
    }

    assignResolvedValue(rootHolder, resolved, cloneValue(patch.value));
  });

  return normalizeOperationalState(rootHolder.value as AppState);
};
