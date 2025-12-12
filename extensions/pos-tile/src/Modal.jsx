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

  // --- Sync cart with POS ---
  useEffect(() => {
    const unsubscribe = shopify.cart.current.subscribe((nextCart) => {
      setCart(nextCart);
    });

    return unsubscribe;
  }, []);

  // --- Extract numeric variantId from a line item ---
  function getVariantIdFromLineItem(lineItem) {
    const raw =
      lineItem.variantId ||
      lineItem.productVariantId ||
      lineItem.id;

    if (!raw) return null;

    const str = String(raw);
    const gidPrefix = 'gid://shopify/ProductVariant/';

    return str.startsWith(gidPrefix)
      ? str.slice(gidPrefix.length)
      : str;
  }

  // --- Fetch Admin images for recommended variants ---
  async function hydrateRecommendationsWithImages(baseRecs) {
    if (!baseRecs || baseRecs.length === 0) return baseRecs;

    const variantGids = baseRecs.map((rec) => `gid://shopify/ProductVariant/${rec.variantId}`);

    const query = `#graphql
      query VariantImages($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            image {
              url
              altText
            }
            product {
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    `;

    const res = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      body: JSON.stringify({
        query,
        variables: { ids: variantGids },
      }),
    });

    if (!res.ok) {
      console.error('Admin API image fetch failed', await res.text());
      return baseRecs;
    }

    const json = await res.json();
    const nodes = json?.data?.nodes || [];

    // Map gid -> image
    const imageByVariantId = {};
    const prefix = 'gid://shopify/ProductVariant/';

    for (const node of nodes) {
      if (!node || !node.id) continue;

      const numericId = node.id.startsWith(prefix)
        ? node.id.slice(prefix.length)
        : node.id;

      // Prefer variant image, otherwise fall back to product featured image
      const imgNode = node.image || node.product?.featuredImage;
      if (!imgNode) continue;

      imageByVariantId[numericId] = {
        url: imgNode.url,
        altText: imgNode.altText || '',
      };
    }

    return baseRecs.map((rec) => ({
      ...rec,
      image: imageByVariantId[rec.variantId] || null,
    }));

  }

  // --- Fetch recommendations from your backend ---
  const handleButtonClick = async () => {
    if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
      shopify.toast.show('Cart is empty');
      return;
    }

    const cartVariantIds = cart.lineItems
      .map(getVariantIdFromLineItem)
      .filter(Boolean);

    if (cartVariantIds.length === 0) {
      shopify.toast.show('No variant IDs found in cart');
      return;
    }

    setLoading(true);
    setShowBanner(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cartVariantIds }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const baseRecs = data.recommendations || [];

      // Enrich with images from Admin API
      const recsWithImages = await hydrateRecommendationsWithImages(baseRecs);
      setRecommendations(recsWithImages);

      setShowBanner(true);
      shopify.toast.show('Upsell suggestions ready');
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      shopify.toast.show('Failed to fetch recommendations');
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

          {!loading && recommendations.length > 0 && (
            <s-stack gap="base">
              {recommendations.map((rec) => (
                <s-box key={rec.variantId} padding="small">
                  <s-stack direction="inline" gap="base">
                    {rec.image?.url && (
                      <s-box inlineSize="64px" blockSize="64px">
                        <s-image
                          src={rec.image.url}
                          inlineSize="fill"
                          objectFit="cover"
                        />
                      </s-box>
                    )}

                    <s-box>
                      <s-text>{rec.productTitle}</s-text>
                      <s-text color="subdued">{rec.variantTitle}</s-text>

                      <s-text>${rec.price}</s-text>
                      <s-text color="subdued">
                        Inventory: {rec.inventoryQuantity}
                      </s-text>
                    </s-box>
                  </s-stack>
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
              {loading ? 'Fetching…' : 'Show upsell'}
            </s-button>
          </s-section>

        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
