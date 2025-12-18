// ./extensions/checkout-upsell/src/Checkout.jsx
import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useMemo, useRef, useState} from "preact/hooks";

const API_BASE_URL =
  "https://posai-backend-recommender-production.up.railway.app";

export default function extension() {
  render(<CheckoutUpsell />, document.body);
}

/**
 * Your backend rec shape (recommended):
 * {
 *   variantId: "46812312207514",          // numeric string
 *   productTitle: "Gift Card",
 *   variantTitle: "$25",
 *   price: "25.00",
 *   image?: { url: string, altText?: string } // IMPORTANT for checkout (no Admin API calls here)
 * }
 */

function CheckoutUpsell() {
  const [lines, setLines] = useState(shopify.lines.value ?? []);
  const [recommendations, setRecommendations] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | empty | error
  const [bannerHeading, setBannerHeading] = useState("Recommended add-ons");
  const [bannerVisible, setBannerVisible] = useState(true);
  const skipNextAutoFetchRef = useRef(false);


  // Track which variantIds are currently being added (disable button + show state)
  const [addingVariantIds, setAddingVariantIds] = useState(() => new Set());

  // ---- Subscribe to checkout cart lines (this is your “cart state”) ----
  useEffect(() => {
    return shopify.lines.subscribe((next) => setLines(next ?? []));
  }, []);

  // ---- Feature availability (Checkout can restrict cart edits) ----
  const canAdd = !!shopify.instructions.value?.lines?.canAddCartLine;
  const canUpdate = !!shopify.instructions.value?.lines?.canUpdateCartLine;
  const DEMO_THUMBNAILS = {
  gift: "https://posai.myshopify.com/cdn/shop/files/gift_card.png?v=1763946615&width=200",
  wax: "https://posai.myshopify.com/cdn/shop/files/snowboard_wax.png?v=1763946614&width=200",
  };

  function getDemoThumbnailSrc(rec) {
    const t = `${rec?.productTitle || ""} ${rec?.variantTitle || ""}`.toLowerCase();

    if (t.includes("gift")) return DEMO_THUMBNAILS.gift;
    if (t.includes("wax")) return DEMO_THUMBNAILS.wax;

    // no src => s-product-thumbnail shows built-in placeholder
    return "";
  }
  // ---- Helpers ----
  function numericVariantIdFromGid(gid) {
    if (!gid) return null;
    const s = String(gid);
    const prefix = "gid://shopify/ProductVariant/";
    if (s.startsWith(prefix)) return s.slice(prefix.length);
    // fallback: last segment
    const last = s.split("/").pop();
    return last || null;
  }

  function variantGidFromNumeric(numericId) {
    return `gid://shopify/ProductVariant/${numericId}`;
  }

  // Current cart variant IDs (numeric strings) used for your recommender request
  const cartVariantIds = useMemo(() => {
    const set = new Set();
    for (const line of lines) {
      const numeric = numericVariantIdFromGid(line?.merchandise?.id);
      if (numeric) set.add(numeric);
    }
    return Array.from(set);
  }, [lines]);

  // Used to detect cart changes and auto-refresh recs
  const cartSignature = useMemo(
    () => cartVariantIds.slice().sort().join(","),
    [cartVariantIds],
  );

  // Quick “is already in cart?” lookup for buttons/badges
  const cartMerchandiseIdSet = useMemo(() => {
    const set = new Set();
    for (const line of lines) {
      if (line?.merchandise?.id) set.add(line.merchandise.id);
    }
    return set;
  }, [lines]);

  function toneForStatus(s) {
    switch (s) {
      case "success":
        return "success";
      case "empty":
        return "warning";
      case "error":
        return "critical";
      case "loading":
      case "idle":
      default:
        return "info";
    }
  }

  // ---- Fetch recommendations (auto refresh on cart change with debounce) ----
  const debounceRef = useRef(null);

  useEffect(() => {
    // If cart empty, clear recs
    if (!cartVariantIds.length) {
      setRecommendations([]);
      setStatus("empty");
      setBannerHeading("Add an item to your cart to see recommendations");
      setBannerVisible(true);
      return;
    }
    // If we just added via POSAI, don't refetch new recs
    if (skipNextAutoFetchRef.current) {
      skipNextAutoFetchRef.current = false; // reset
      return;
    }
    // Debounce refresh so we don’t spam your backend while buyer edits cart
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchRecommendations(cartVariantIds);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  async function fetchRecommendations(ids) {
    setStatus("loading");
    setBannerHeading("Finding add-ons that pair well with your cart…");
    setBannerVisible(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({cartVariantIds: ids}),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const base = Array.isArray(data?.recommendations) ? data.recommendations : [];

      // De-dupe + keep it compact for checkout (feels “native”)
      const seen = new Set();
      const cleaned = [];
      for (const r of base) {
        if (!r?.variantId) continue;
        if (seen.has(r.variantId)) continue;
        seen.add(r.variantId);
        cleaned.push(r);
        if (cleaned.length >= 4) break;
      }

      setRecommendations(cleaned);

      if (cleaned.length === 0) {
        setStatus("empty");
        setBannerHeading("No recommendations for this cart right now");
      } else {
        setStatus("success");
        setBannerHeading("Recommended add-ons");
      }
    } catch (err) {
      console.error("checkout upsell fetch failed:", err);
      setRecommendations([]);
      setStatus("error");
      setBannerHeading("Couldn’t load recommendations");
      setBannerVisible(true);
    }
  }

  // ---- Add to checkout cart (updates cart + checkout automatically) ----
async function handleAdd(rec) {
  if (!rec?.variantId) return;
  skipNextAutoFetchRef.current = true;

  const merchandiseId = `gid://shopify/ProductVariant/${rec.variantId}`;
  const existingLine = lines.find((l) => l?.merchandise?.id === merchandiseId);

  setAddingVariantIds((prev) => {
    const next = new Set(prev);
    next.add(rec.variantId);
    return next;
  });

  try {
    let result;

    if (existingLine && canUpdate) {
      result = await shopify.applyCartLinesChange({
        type: "updateCartLine",
        id: existingLine.id,
        quantity: (existingLine.quantity ?? 1) + 1,
      });
    } else {
      result = await shopify.applyCartLinesChange({
        type: "addCartLine",
        merchandiseId,
        quantity: 1,
      });
    }

    if (result?.type === "error") {
      console.error("applyCartLinesChange error:", result.message);
      setStatus("error");
      setBannerHeading("Couldn’t add item to your order");
      setBannerVisible(true);
      return;
    }

    setStatus("success");
    setBannerHeading("Added to your order");
    setBannerVisible(true);
  } catch (err) {
    console.error("applyCartLinesChange threw:", err);
    setStatus("error");
    setBannerHeading("Couldn’t add item to your order");
    setBannerVisible(true);
  } finally {
    setAddingVariantIds((prev) => {
      const next = new Set(prev);
      next.delete(rec.variantId);
      return next;
    });
  }
}

  // ---- UI ----
  if (!canAdd && !canUpdate) {
    // Follow Shopify’s guidance: check instructions before calling applyCartLinesChange :contentReference[oaicite:3]{index=3}
    return (
      <s-banner heading="POSAI upsell" tone="warning">
        Cart edits aren’t supported in this checkout.
      </s-banner>
    );
  }

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      {bannerVisible && (
        <s-banner heading={bannerHeading} tone={toneForStatus(status)}>
          <s-button
            slot="primary-action"
            variant="secondary"
            onClick={() => setBannerVisible(false)}
          >
            Dismiss
          </s-button>

          <s-stack gap="base">
            {status === "loading" && (
              <s-text color="subdued">Loading recommendations…</s-text>
            )}

            {status !== "loading" && recommendations.length > 0 && (
              <s-stack gap="base">
                {recommendations.map((rec) => {
                  const merchId = variantGidFromNumeric(rec.variantId);
                  const inCart = cartMerchandiseIdSet.has(merchId);
                  const isAdding = addingVariantIds.has(rec.variantId);

                  return (
                    <s-box
                      key={rec.variantId}
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                      background="base"
                    >
                      <s-stack direction="inline" gap="small" alignItems="normal" justifyContent="space-between">
                        {/* Left */}
                        <s-stack direction="inline" gap="base" alignItems="normal">
                          <s-product-thumbnail
                            src={rec.image?.url || getDemoThumbnailSrc(rec)}
                            alt={rec.image?.altText || rec.productTitle || "Recommended product"}
                            size="base"
                          />


                          <s-stack direction="block" gap="small-100" alignItems="normal">
                            <s-text>{rec.productTitle || "Recommended item"}</s-text>
                            {rec.variantTitle && (
                              <s-text color="subdued">{rec.variantTitle}</s-text>
                            )}
                            {rec.price && <s-text>${rec.price}</s-text>}
                          </s-stack>
                        </s-stack>

                        {/* Right */}
                        <s-stack gap="small" alignItems="end">
                          <s-badge tone={inCart ? "neutral" : "critical"}>
                            {inCart ? "In cart" : "Suggested"}
                          </s-badge>

                          <s-button
                            variant="primary"
                            disabled={isAdding}
                            onClick={() => handleAdd(rec)}
                          >
                            {isAdding ? "Adding…" : inCart ? "Add another" : "Add"}
                          </s-button>
                        </s-stack>
                      </s-stack>
                    </s-box>
                  );
                })}
              </s-stack>
            )}

            {status !== "loading" && recommendations.length === 0 && (
              <s-text color="subdued">
                {cartVariantIds.length ? "No upsells found." : "Cart is empty."}
              </s-text>
            )}

            <s-divider direction="block" />

            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-text color="subdued">Auto-refreshes when your cart changes.</s-text>
              <s-button
                variant="secondary"
                onClick={() => fetchRecommendations(cartVariantIds)}
                disabled={status === "loading" || cartVariantIds.length === 0}
              >
                Refresh
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      {!bannerVisible && (
        <s-button variant="secondary" onClick={() => setBannerVisible(true)}>
          Show POSAI recommendations
        </s-button>
      )}
    </s-box>
  );
}
