"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChefHat,
  Clock3,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  Users
} from "lucide-react";

import { resolveAppUrl } from "@kiju/config";
import { euro, type CourseKey, type OrderModifierSelection } from "@kiju/domain";

type PublicModifierOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

type PublicModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: PublicModifierOption[];
};

type PublicProduct = {
  id: string;
  name: string;
  category: CourseKey;
  drinkSubcategory?: string;
  description: string;
  priceCents: number;
  taxRate: number;
  allergens: string[];
  modifierGroups: PublicModifierGroup[];
};

type CatalogResponse = {
  location: {
    id: string;
    name: string;
  };
  products: PublicProduct[];
};

type CustomerStatus = "received" | "preparing" | "partially-ready" | "ready" | "closed";
type PaymentCallStatus = "idle" | "requested" | "accepted";

type OrderStatusResponse = {
  orderId: string;
  accessToken?: string;
  pickupNumber: number;
  customerName: string;
  guestCount: number;
  locationName: string;
  status: CustomerStatus;
  paymentCallStatus: PaymentCallStatus;
  closed?: boolean;
  totalCents: number;
  items?: {
    id: string;
    productId: string;
    name: string;
    quantity: number;
    note?: string;
    modifiers: OrderModifierSelection[];
  }[];
};

type StoredOrderAccess = {
  orderId: string;
  accessToken: string;
};

type CartLine = {
  id: string;
  productId: string;
  quantity: number;
  note: string;
  modifiers: OrderModifierSelection[];
};

const categoryOrder: CourseKey[] = ["starter", "main", "drinks", "dessert"];
const categoryLabels: Record<CourseKey, string> = {
  starter: "Vorspeisen",
  main: "Hauptspeisen",
  drinks: "Getränke",
  dessert: "Nachtisch"
};
const statusLabels: Record<CustomerStatus, string> = {
  received: "Bestellung eingegangen",
  preparing: "In Zubereitung",
  "partially-ready": "Teilweise fertig",
  ready: "Abholbereit",
  closed: "Abgeschlossen"
};

const createRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const readErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join(" ")
      : body.message ?? "Die Anfrage konnte nicht verarbeitet werden.";
  } catch {
    return "Die Anfrage konnte nicht verarbeitet werden.";
  }
};

const calculateLineTotal = (line: CartLine, product: PublicProduct) => {
  const selectedIds = new Set(line.modifiers.flatMap((selection) => selection.optionIds));
  const modifierTotal = product.modifierGroups
    .flatMap((group) => group.options)
    .filter((option) => selectedIds.has(option.id))
    .reduce((sum, option) => sum + option.priceDeltaCents, 0);
  return (product.priceCents + modifierTotal) * line.quantity;
};

export const SelfOrderPage = ({ accessKey }: { accessKey: string }) => {
  const storageKey = `kiju-self-order:${accessKey}`;
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [guestCount, setGuestCount] = useState("1");
  const [activeCategory, setActiveCategory] = useState<CourseKey>("starter");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [draftProductId, setDraftProductId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftNote, setDraftNote] = useState("");
  const [draftModifiers, setDraftModifiers] = useState<OrderModifierSelection[]>([]);
  const [orderAccess, setOrderAccess] = useState<StoredOrderAccess | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const productsById = useMemo(
    () => new Map((catalog?.products ?? []).map((product) => [product.id, product])),
    [catalog]
  );
  const visibleProducts = useMemo(
    () => (catalog?.products ?? []).filter((product) => product.category === activeCategory),
    [activeCategory, catalog]
  );
  const draftProduct = draftProductId ? productsById.get(draftProductId) : undefined;
  const cartTotal = cart.reduce((sum, line) => {
    const product = productsById.get(line.productId);
    return product ? sum + calculateLineTotal(line, product) : sum;
  }, 0);
  const cartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);

  const loadStatus = useCallback(async (access: StoredOrderAccess) => {
    const response = await fetch(
      resolveAppUrl(`/api/self-order/orders/${encodeURIComponent(access.orderId)}`),
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${access.accessToken}`
        }
      }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 404) {
        window.localStorage.removeItem(storageKey);
        setOrderAccess(null);
      }
      return;
    }
    const status = (await response.json()) as OrderStatusResponse;
    setOrderStatus(status);
    setCustomerName(status.customerName);
    setGuestCount(String(status.guestCount));
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    void fetch(
      resolveAppUrl(
        `/api/self-order/locations/${encodeURIComponent(accessKey)}/catalog`
      ),
      { cache: "no-store" }
    ).then(async (response) => {
      if (!active) return;
      if (!response.ok) {
        setCatalogError(await readErrorMessage(response));
        return;
      }
      const nextCatalog = (await response.json()) as CatalogResponse;
      setCatalog(nextCatalog);
      const firstCategory = categoryOrder.find((category) =>
        nextCatalog.products.some((product) => product.category === category)
      );
      if (firstCategory) setActiveCategory(firstCategory);
    }).catch(() => {
      if (active) setCatalogError("Die Speisekarte ist momentan nicht erreichbar.");
    });

    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const access = JSON.parse(stored) as StoredOrderAccess;
        if (access.orderId && access.accessToken) {
          setOrderAccess(access);
          void loadStatus(access);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    return () => {
      active = false;
    };
  }, [accessKey, loadStatus, storageKey]);

  useEffect(() => {
    if (!orderAccess || orderStatus?.closed) return;
    const timer = window.setInterval(() => {
      void loadStatus(orderAccess);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadStatus, orderAccess, orderStatus?.closed]);

  const openProduct = (product: PublicProduct) => {
    setDraftProductId(product.id);
    setDraftQuantity(1);
    setDraftNote("");
    setDraftModifiers([]);
    setFeedback(null);
  };

  const toggleDraftOption = (
    group: PublicModifierGroup,
    optionId: string,
    checked: boolean
  ) => {
    setDraftModifiers((current) => {
      const existing = current.find((selection) => selection.groupId === group.id);
      let optionIds = existing?.optionIds ?? [];
      if (group.max === 1) {
        optionIds = checked ? [optionId] : [];
      } else {
        optionIds = checked
          ? [...new Set([...optionIds, optionId])].slice(0, group.max)
          : optionIds.filter((id) => id !== optionId);
      }
      const next = current.filter((selection) => selection.groupId !== group.id);
      return optionIds.length > 0 ? [...next, { groupId: group.id, optionIds }] : next;
    });
  };

  const addDraftToCart = () => {
    if (!draftProduct) return;
    const invalidGroup = draftProduct.modifierGroups.find((group) => {
      const count =
        draftModifiers.find((selection) => selection.groupId === group.id)?.optionIds.length ?? 0;
      return count < group.min || count > group.max || (group.required && count === 0);
    });
    if (invalidGroup) {
      setFeedback(`Bitte prüfe die Auswahl „${invalidGroup.name}“.`);
      return;
    }
    if (draftNote.trim().length > 200) {
      setFeedback("Der Hinweis darf höchstens 200 Zeichen lang sein.");
      return;
    }

    setCart((current) => [
      ...current,
      {
        id: createRequestId(),
        productId: draftProduct.id,
        quantity: Math.max(1, Math.min(20, draftQuantity)),
        note: draftNote.trim(),
        modifiers: draftModifiers
      }
    ]);
    setDraftProductId(null);
    setFeedback(`${draftProduct.name} wurde zum Warenkorb hinzugefügt.`);
  };

  const updateCartQuantity = (lineId: string, delta: number) => {
    setCart((current) =>
      current.map((line) =>
        line.id === lineId
          ? { ...line, quantity: Math.max(1, Math.min(20, line.quantity + delta)) }
          : line
      )
    );
  };

  const submitOrder = async () => {
    if (cart.length === 0) {
      setFeedback("Bitte wähle mindestens einen Artikel aus.");
      return;
    }
    if (!orderAccess && (customerName.trim().length < 2 || Number(guestCount) < 1)) {
      setFeedback("Bitte gib deinen Namen und die Personenzahl an.");
      return;
    }

    setBusy(true);
    setFeedback(null);
    const body = {
      idempotencyKey: createRequestId(),
      ...(!orderAccess
        ? {
            customerName: customerName.trim(),
            guestCount: Number(guestCount)
          }
        : {}),
      lines: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        note: line.note || undefined,
        modifiers: line.modifiers
      }))
    };
    const url = orderAccess
      ? resolveAppUrl(
          `/api/self-order/orders/${encodeURIComponent(orderAccess.orderId)}/items`
        )
      : resolveAppUrl(
          `/api/self-order/locations/${encodeURIComponent(accessKey)}/orders`
        );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(orderAccess
            ? { Authorization: `Bearer ${orderAccess.accessToken}` }
            : {})
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        setFeedback(await readErrorMessage(response));
        return;
      }
      const result = (await response.json()) as OrderStatusResponse;
      let nextAccess = orderAccess;
      if (!nextAccess && result.accessToken) {
        nextAccess = {
          orderId: result.orderId,
          accessToken: result.accessToken
        };
        window.localStorage.setItem(storageKey, JSON.stringify(nextAccess));
        setOrderAccess(nextAccess);
      }
      setOrderStatus(result);
      setCart([]);
      setFeedback(
        orderAccess
          ? "Deine Nachbestellung wurde sicher gesendet."
          : `Bestellung gesendet. Deine Abholnummer ist ${result.pickupNumber}.`
      );
      if (nextAccess) void loadStatus(nextAccess);
    } catch {
      setFeedback("Die Bestellung konnte nicht gesendet werden. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  };

  const callService = async () => {
    if (!orderAccess || orderStatus?.closed) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(
        resolveAppUrl(
          `/api/self-order/orders/${encodeURIComponent(orderAccess.orderId)}/payment-call`
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${orderAccess.accessToken}`
          },
          body: JSON.stringify({ idempotencyKey: createRequestId() })
        }
      );
      if (!response.ok) {
        setFeedback(await readErrorMessage(response));
        return;
      }
      const status = (await response.json()) as OrderStatusResponse;
      setOrderStatus(status);
      setFeedback(
        status.paymentCallStatus === "accepted"
          ? "Der Service ist bereits unterwegs."
          : "Der Service wurde zum Bezahlen gerufen."
      );
    } catch {
      setFeedback("Der Service konnte nicht gerufen werden. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  };

  if (catalogError) {
    return (
      <main className="kiju-self-order-shell">
        <section className="kiju-self-order-error">
          <ShoppingBag size={34} />
          <h1>Bestellung nicht verfügbar</h1>
          <p>{catalogError}</p>
        </section>
      </main>
    );
  }

  if (!catalog) {
    return <main className="kiju-self-order-loading">Speisekarte wird geladen …</main>;
  }

  return (
    <main className="kiju-self-order-shell">
      <header className="kiju-self-order-hero">
        <div>
          <span>KiJu Selbstbestellung</span>
          <h1>Direkt bestellen</h1>
          <p>Ort: <strong>{catalog.location.name}</strong></p>
        </div>
        <ShoppingBag size={32} />
      </header>

      {orderStatus ? (
        <section className={`kiju-self-order-status is-${orderStatus.status}`}>
          <div>
            <span>Deine Abholnummer</span>
            <strong>{orderStatus.pickupNumber}</strong>
          </div>
          <div>
            <span>Aktueller Status</span>
            <strong>{statusLabels[orderStatus.status]}</strong>
          </div>
          <small>
            {orderStatus.customerName} · {orderStatus.guestCount} Personen ·{" "}
            {euro(orderStatus.totalCents)}
          </small>
        </section>
      ) : (
        <section className="kiju-self-order-customer">
          <label>
            <span>Dein Name</span>
            <input
              value={customerName}
              maxLength={80}
              autoComplete="name"
              placeholder="Vor- und Nachname"
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label>
            <span>Personenzahl</span>
            <input
              type="number"
              min="1"
              max="20"
              value={guestCount}
              onChange={(event) => setGuestCount(event.target.value)}
            />
          </label>
        </section>
      )}

      {!orderStatus?.closed ? (
        <>
          <nav className="kiju-self-order-categories" aria-label="Kategorien">
            {categoryOrder.map((category) => {
              const count = catalog.products.filter((product) => product.category === category).length;
              if (count === 0) return null;
              return (
                <button
                  key={category}
                  type="button"
                  className={activeCategory === category ? "is-active" : ""}
                  onClick={() => setActiveCategory(category)}
                >
                  {categoryLabels[category]}
                  <small>{count}</small>
                </button>
              );
            })}
          </nav>

          <section className="kiju-self-order-products">
            {visibleProducts.map((product) => (
              <article key={product.id}>
                <div>
                  <span>{categoryLabels[product.category]}</span>
                  <h2>{product.name}</h2>
                  <p>{product.description}</p>
                  {product.allergens.length > 0 ? (
                    <small>Allergene: {product.allergens.join(", ")}</small>
                  ) : null}
                </div>
                <footer>
                  <strong>{euro(product.priceCents)}</strong>
                  <button type="button" onClick={() => openProduct(product)}>
                    <Plus size={18} />
                    Auswählen
                  </button>
                </footer>
              </article>
            ))}
          </section>

          {draftProduct ? (
            <section className="kiju-self-order-product-dialog" role="dialog" aria-modal="true">
              <div className="kiju-self-order-product-dialog__card">
                <header>
                  <div>
                    <span>Artikel konfigurieren</span>
                    <h2>{draftProduct.name}</h2>
                  </div>
                  <strong>{euro(draftProduct.priceCents)}</strong>
                </header>

                {draftProduct.modifierGroups.map((group) => (
                  <fieldset key={group.id}>
                    <legend>
                      {group.name}
                      <small>
                        {group.required ? "Pflichtauswahl" : "Optional"} · maximal {group.max}
                      </small>
                    </legend>
                    {group.options.map((option) => {
                      const checked =
                        draftModifiers
                          .find((selection) => selection.groupId === group.id)
                          ?.optionIds.includes(option.id) ?? false;
                      return (
                        <label key={option.id}>
                          <input
                            type={group.max === 1 ? "radio" : "checkbox"}
                            name={`modifier-${group.id}`}
                            checked={checked}
                            onChange={(event) =>
                              toggleDraftOption(group, option.id, event.target.checked)
                            }
                          />
                          <span>{option.name}</span>
                          <strong>
                            {option.priceDeltaCents > 0
                              ? `+ ${euro(option.priceDeltaCents)}`
                              : "inklusive"}
                          </strong>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}

                <label className="kiju-self-order-note">
                  <span>Hinweis zur Bestellung</span>
                  <textarea
                    value={draftNote}
                    maxLength={200}
                    placeholder="Zum Beispiel ohne Zwiebeln"
                    onChange={(event) => setDraftNote(event.target.value)}
                  />
                  <small>{draftNote.length}/200 Zeichen</small>
                </label>

                <div className="kiju-self-order-quantity">
                  <button
                    type="button"
                    onClick={() => setDraftQuantity((current) => Math.max(1, current - 1))}
                  >
                    <Minus size={18} />
                  </button>
                  <strong>{draftQuantity}</strong>
                  <button
                    type="button"
                    onClick={() => setDraftQuantity((current) => Math.min(20, current + 1))}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                <div className="kiju-self-order-dialog-actions">
                  <button type="button" onClick={() => setDraftProductId(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="is-primary" onClick={addDraftToCart}>
                    In den Warenkorb
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="kiju-self-order-cart">
            <header>
              <div>
                <span>Warenkorb</span>
                <h2>{cartQuantity} Artikel</h2>
              </div>
              <strong>{euro(cartTotal)}</strong>
            </header>
            {cart.length > 0 ? (
              <div>
                {cart.map((line) => {
                  const product = productsById.get(line.productId);
                  if (!product) return null;
                  return (
                    <article key={line.id}>
                      <div>
                        <strong>{product.name}</strong>
                        {line.note ? <small>Hinweis: {line.note}</small> : null}
                        <span>{euro(calculateLineTotal(line, product))}</span>
                      </div>
                      <div className="kiju-self-order-cart__actions">
                        <button type="button" onClick={() => updateCartQuantity(line.id, -1)}>
                          <Minus size={16} />
                        </button>
                        <strong>{line.quantity}</strong>
                        <button type="button" onClick={() => updateCartQuantity(line.id, 1)}>
                          <Plus size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`${product.name} entfernen`}
                          onClick={() =>
                            setCart((current) => current.filter((entry) => entry.id !== line.id))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p>Noch keine Artikel ausgewählt.</p>
            )}

            {feedback ? <div className="kiju-self-order-feedback">{feedback}</div> : null}

            <button
              type="button"
              className="kiju-self-order-submit"
              disabled={busy || cart.length === 0}
              onClick={() => void submitOrder()}
            >
              {busy ? <Clock3 size={20} /> : <CheckCircle2 size={20} />}
              {orderAccess ? "Nachbestellung senden" : "Bestellung verbindlich senden"}
            </button>
            <small>Bezahlung erfolgt vor Ort beim Service.</small>
          </section>
        </>
      ) : null}

      {orderStatus ? (
        <section className="kiju-self-order-summary">
          <header>
            <div>
              <ReceiptText size={20} />
              <strong>Deine Bestellung</strong>
            </div>
            <strong>{euro(orderStatus.totalCents)}</strong>
          </header>
          <div>
            {(orderStatus.items ?? []).map((item) => (
              <article key={item.id}>
                <span>{item.quantity} × {item.name}</span>
                {item.note ? <small>{item.note}</small> : null}
              </article>
            ))}
          </div>
          {!orderStatus.closed ? (
            <button
              type="button"
              className="kiju-self-order-service-call"
              disabled={busy || orderStatus.paymentCallStatus === "accepted"}
              onClick={() => void callService()}
            >
              <Users size={20} />
              {orderStatus.paymentCallStatus === "accepted"
                ? "Service ist unterwegs"
                : orderStatus.paymentCallStatus === "requested"
                  ? "Service wurde gerufen"
                  : "Service zum Bezahlen rufen"}
            </button>
          ) : (
            <div className="kiju-self-order-closed">
              <ChefHat size={20} />
              Vielen Dank. Deine Bestellung ist abgeschlossen.
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
};
