// ./extensions/pos-tile/src/Modal.jsx
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const API_BASE_URL = "https://posai-backend-recommender-production.up.railway.app";

export default function extension() {
  render(<Modal />, document.body);
}

function Modal() {
  const [cart, setCart] = useState(shopify.cart.current.value);
  const [showBanner, setShowBanner] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- Sync cart ---
  useEffect(() => {
    const unsubscribe = shopify.cart.current.subscribe((nextCart) => {
      setCart(nextCart);
    });

    return unsubscribe;
  }, []);

  // --- Extract variantId from line item ---
  function getVariantIdFromLineItem(lineItem) {
    const raw =
      lineItem.variantId ||
      lineItem.productVariantId ||
      lineItem.id;

    if (!raw) return null;

    const str = String(raw);
    const gidPrefix = "gid://shopify/ProductVariant/";

    return str.startsWith(gidPrefix)
      ? str.slice(gidPrefix.length)
      : str;
  }

  // --- Fetch recommendations ---
  const handleButtonClick = async () => {
    if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
      shopify.toast.show("Cart is empty");
      return;
    }

    const cartVariantIds = cart.lineItems
      .map(getVariantIdFromLineItem)
      .filter(Boolean);

    if (cartVariantIds.length === 0) {
      shopify.toast.show("No variant IDs found in cart");
      return;
    }

    setLoading(true);
    setShowBanner(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cartVariantIds }),
      });
      shopify.toast.show(String(res));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setRecommendations(data.recommendations || []);

      setShowBanner(true);
      shopify.toast.show("Upsell suggestions ready");
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
      // shopify.toast.show("Failed to fetch recommendations");
    } finally {
      setLoading(false);
    }
  };

  // ---- UI ----
  return (
    <s-page heading="POS smart upsell">
      <s-scroll-box>
        <s-box padding="small">

          {showBanner && (
            <s-banner heading="Upsell applied" tone="success">
              Recommendations have been updated.
            </s-banner>
          )}

          <s-section heading="Recommended products">
            {loading && <s-text>Loading recommendations…</s-text>}

            {!loading && recommendations.length === 0 && (
              <s-text>No recommendations yet. Tap “Show upsell”.</s-text>
            )}

            {!loading && recommendations.length > 0 && (
              <s-stack gap="base">
                {recommendations.map((rec) => (
                  <s-box key={rec.variantId} padding="small">
                    <s-text>{rec.productTitle}</s-text>
                    <s-text color="subdued">{rec.variantTitle}</s-text>

                    <s-text>${rec.price}</s-text>
                    <s-text color="subdued">
                      Inventory: {rec.inventoryQuantity}
                    </s-text>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-section>

          <s-section>
            <s-button
              variant="primary"
              onClick={handleButtonClick}
              disabled={loading}
            >
              {loading ? "Fetching…" : "Show upsell"}
            </s-button>
          </s-section>

        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
