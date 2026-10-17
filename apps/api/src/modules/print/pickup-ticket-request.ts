import type { AppState } from "@kiju/domain";

export const withPickupTicketCustomerName = (
  request: unknown,
  tables?: AppState["tables"]
) => {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return request;
  }

  const value = request as Record<string, unknown>;
  if (value["type"] !== "pickup-ticket") {
    return request;
  }

  const customerName =
    typeof value["customerName"] === "string" ? value["customerName"].trim() : "";
  if (customerName) {
    return { ...value, customerName };
  }

  const tableId = typeof value["tableId"] === "string" ? value["tableId"] : "";
  const pickupName = Array.isArray(tables)
    ? tables.find((table) => table.id === tableId)?.pickupName?.trim()
    : "";

  return pickupName ? { ...value, customerName: pickupName } : request;
};
