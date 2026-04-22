"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClosedSessions = exports.buildDashboardSummary = exports.buildKitchenSummary = exports.calculateGuestCount = exports.getOpenTotalForTables = exports.getCheckoutTableIds = exports.getLinkedTableGroupForTable = exports.getOpenLineItems = exports.calculateSessionOpenTotal = exports.calculateSessionPaidTotal = exports.calculateLineItemsTotal = exports.calculateOpenItemQuantity = exports.calculatePaidItemQuantity = exports.calculateSessionTotal = exports.calculateItemTotal = exports.resolveSessionStatus = exports.getTableTargetItems = exports.getSeatItems = exports.getOrderTargetKey = exports.getItemsForCourse = exports.getSessionForTable = exports.getProductById = exports.euro = exports.paymentLabels = exports.courseLabels = void 0;
exports.courseLabels = {
    drinks: "Getränke",
    starter: "Vorspeise",
    main: "Hauptspeise",
    dessert: "Nachtisch"
};
exports.paymentLabels = {
    cash: "Bar",
    card: "Karte",
    voucher: "Gutschein"
};
const euro = (valueCents) => new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
}).format(valueCents / 100);
exports.euro = euro;
const getProductById = (products, id) => products.find((product) => product.id === id);
exports.getProductById = getProductById;
const getSessionForTable = (sessions, tableId) => sessions.find((session) => session.tableId === tableId && session.status !== "closed");
exports.getSessionForTable = getSessionForTable;
const getItemsForCourse = (session, course) => session?.items.filter((item) => item.category === course) ?? [];
exports.getItemsForCourse = getItemsForCourse;
const getOrderTargetKey = (item) => item.target?.type === "table" ? "table" : item.target?.seatId ?? item.seatId ?? "table";
exports.getOrderTargetKey = getOrderTargetKey;
const getSeatItems = (session, seatId) => session?.items.filter((item) => item.target?.type === "seat" && item.target.seatId === seatId) ?? [];
exports.getSeatItems = getSeatItems;
const getTableTargetItems = (session) => session?.items.filter((item) => item.target?.type === "table" || !item.target) ?? [];
exports.getTableTargetItems = getTableTargetItems;
const resolveSessionStatus = (table, session) => {
    if (table.plannedOnly && !table.active)
        return "planned";
    if (!session)
        return "idle";
    return session.status;
};
exports.resolveSessionStatus = resolveSessionStatus;
const calculateItemTotal = (item, products) => {
    const product = (0, exports.getProductById)(products, item.productId);
    if (!product)
        return 0;
    const modifierTotal = item.modifiers.reduce((sum, modifierSelection) => {
        const modifierGroup = product.modifierGroups.find((group) => group.id === modifierSelection.groupId);
        if (!modifierGroup)
            return sum;
        return (sum +
            modifierSelection.optionIds.reduce((optionSum, optionId) => {
                const option = modifierGroup.options.find((entry) => entry.id === optionId);
                return optionSum + (option?.priceDeltaCents ?? 0);
            }, 0));
    }, 0);
    return (product.priceCents + modifierTotal) * item.quantity;
};
exports.calculateItemTotal = calculateItemTotal;
const calculateSessionTotal = (session, products) => session?.items.reduce((sum, item) => sum + (0, exports.calculateItemTotal)(item, products), 0) ?? 0;
exports.calculateSessionTotal = calculateSessionTotal;
const calculatePaidItemQuantity = (session, itemId) => {
    if (!session)
        return 0;
    return session.payments.reduce((sum, payment) => sum +
        (payment.lineItems ?? []).filter((lineItem) => lineItem.itemId === itemId).reduce((lineSum, lineItem) => lineSum + lineItem.quantity, 0), 0);
};
exports.calculatePaidItemQuantity = calculatePaidItemQuantity;
const calculateOpenItemQuantity = (session, item) => Math.max(0, item.quantity - (0, exports.calculatePaidItemQuantity)(session, item.id));
exports.calculateOpenItemQuantity = calculateOpenItemQuantity;
const calculateLineItemsTotal = (session, products, lineItems) => lineItems.reduce((sum, lineItem) => {
    const item = session?.items.find((entry) => entry.id === lineItem.itemId);
    if (!item)
        return sum;
    const quantity = Math.min((0, exports.calculateOpenItemQuantity)(session, item), Math.max(0, lineItem.quantity));
    if (quantity <= 0)
        return sum;
    return sum + Math.round(((0, exports.calculateItemTotal)(item, products) / item.quantity) * quantity);
}, 0);
exports.calculateLineItemsTotal = calculateLineItemsTotal;
const calculateSessionPaidTotal = (session) => session?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
exports.calculateSessionPaidTotal = calculateSessionPaidTotal;
const calculateSessionOpenTotal = (session, products) => Math.max(0, (0, exports.calculateSessionTotal)(session, products) - (0, exports.calculateSessionPaidTotal)(session));
exports.calculateSessionOpenTotal = calculateSessionOpenTotal;
const getOpenLineItems = (session) => session?.items
    .map((item) => ({
    item,
    openQuantity: (0, exports.calculateOpenItemQuantity)(session, item)
}))
    .filter((entry) => entry.openQuantity > 0) ?? [];
exports.getOpenLineItems = getOpenLineItems;
const getLinkedTableGroupForTable = (state, tableId) => (state.linkedTableGroups ?? []).find((group) => group.active && group.tableIds.includes(tableId));
exports.getLinkedTableGroupForTable = getLinkedTableGroupForTable;
const getCheckoutTableIds = (state, tableId) => (0, exports.getLinkedTableGroupForTable)(state, tableId)?.tableIds ?? [tableId];
exports.getCheckoutTableIds = getCheckoutTableIds;
const getOpenTotalForTables = (state, tableIds) => tableIds.reduce((sum, tableId) => {
    const session = (0, exports.getSessionForTable)(state.sessions, tableId);
    return sum + (0, exports.calculateSessionOpenTotal)(session, state.products);
}, 0);
exports.getOpenTotalForTables = getOpenTotalForTables;
const calculateGuestCount = (session) => session ? new Set(session.items.map(exports.getOrderTargetKey)).size : 0;
exports.calculateGuestCount = calculateGuestCount;
const buildKitchenSummary = (session, table, products) => {
    const courses = ["starter", "main", "dessert", "drinks"].map((course) => {
        const items = (0, exports.getItemsForCourse)(session, course);
        const ticket = session?.courseTickets[course];
        const status = ticket?.status ?? "not-recorded";
        const label = status === "not-recorded"
            ? "Nicht erfasst"
            : status === "skipped"
                ? "X"
                : items
                    .map((item) => (0, exports.getProductById)(products, item.productId)?.name ?? "Unbekannt")
                    .join(", ");
        return {
            course,
            label,
            status,
            itemCount: items.length
        };
    });
    return {
        tableId: table.id,
        tableName: table.name,
        active: table.active,
        plannedOnly: table.plannedOnly,
        courses
    };
};
exports.buildKitchenSummary = buildKitchenSummary;
const buildDashboardSummary = (state) => state.tables.map((table) => {
    const session = (0, exports.getSessionForTable)(state.sessions, table.id);
    return {
        table,
        session,
        status: (0, exports.resolveSessionStatus)(table, session),
        total: (0, exports.calculateSessionTotal)(session, state.products),
        guests: (0, exports.calculateGuestCount)(session)
    };
});
exports.buildDashboardSummary = buildDashboardSummary;
const buildClosedSessions = (state) => state.sessions.filter((session) => session.status === "closed");
exports.buildClosedSessions = buildClosedSessions;
//# sourceMappingURL=workflow.js.map
