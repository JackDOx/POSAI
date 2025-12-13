// ./extensions/pos-tile/src/Modal.jsx
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const API_BASE_URL = 'https://posai-backend-recommender-production.up.railway.app';

export default function extension() {
  render(<Modal />, document.body);
}

function Modal() {
  const [cart, setCart] = useState(shopify.cart.current.value);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addedVariantIds, setAddedVariantIds] = useState([]);

  // Banner state
  const [bannerStatus, setBannerStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'empty' | 'error'
  const [bannerHeading, setBannerHeading] = useState(
    'Tap “Show upsell” to fetch recommendations',
  );
  const [bannerVisible, setBannerVisible] = useState(true);

  function mapStatusToTone(status) {
    switch (status) {
      case 'success':
        return 'success';
      case 'empty':
        return 'warning';
      case 'error':
        return 'critical';
      case 'loading':
        return 'info';
      case 'idle':
      default:
        return 'info';
    }
  }

  // --- Sync cart with POS ---
  useEffect(() => {
    const unsubscribe = shopify.cart.current.subscribe((nextCart) => {
      setCart(nextCart);
    });

    return unsubscribe;
  }, []);

  // --- Extract numeric variantId from a line item ---
  function getVariantIdFromLineItem(lineItem) {
    const raw = lineItem.variantId || lineItem.productVariantId || lineItem.id;
    if (!raw) return null;

    const str = String(raw);
    const gidPrefix = 'gid://shopify/ProductVariant/';
    return str.startsWith(gidPrefix) ? str.slice(gidPrefix.length) : str;
  }

  async function handleAddToCart(variantIdString) {
    const variantId = Number(variantIdString);

    if (!Number.isFinite(variantId)) {
      console.error('Invalid variant id:', variantIdString);
      shopify.toast.show('Unable to add item (invalid variant id)');
      return;
    }

    try {
      await shopify.cart.addLineItem(variantId, 1);
      shopify.toast.show('Item added to cart');

      setAddedVariantIds((prev) =>
        prev.includes(variantIdString) ? prev : [...prev, variantIdString],
      );
    } catch (err) {
      console.error('Failed to add line item:', err);
      shopify.toast.show('Failed to add item to cart');
    }
  }

  // Add ALL recommended items that aren’t already added
  async function handleAddAllToCart() {
    if (!recommendations.length) {
      shopify.toast.show('No recommendations to add');
      return;
    }

    const toAdd = recommendations.filter(
      (rec) => !addedVariantIds.includes(rec.variantId),
    );

    if (!toAdd.length) {
      shopify.toast.show('All recommendations already in cart');
      return;
    }

    let addedCount = 0;

    for (const rec of toAdd) {
      const numericId = Number(rec.variantId);
      if (!Number.isFinite(numericId)) continue;

      try {
        await shopify.cart.addLineItem(numericId, 1);
        addedCount += 1;
      } catch (err) {
        console.error('Failed to add item in bulk add:', err);
      }
    }

    if (addedCount > 0) {
      // Mark all of them as added
      setAddedVariantIds((prev) => {
        const all = new Set([...prev, ...toAdd.map((r) => r.variantId)]);
        return Array.from(all);
      });
      shopify.toast.show(`Added ${addedCount} item(s) to cart`);
    } else {
      shopify.toast.show('No items were added');
    }
  }

  // --- Fetch Admin images for recommended variants ---
  async function hydrateRecommendationsWithImages(baseRecs) {
    if (!baseRecs || baseRecs.length === 0) return baseRecs;

    const variantGids = baseRecs.map(
      (rec) => `gid://shopify/ProductVariant/${rec.variantId}`,
    );

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
        variables: {ids: variantGids},
      }),
    });

    if (!res.ok) {
      console.error('Admin API image fetch failed', await res.text());
      return baseRecs;
    }

    const json = await res.json();
    const nodes = json?.data?.nodes || [];

    const imageByVariantId = {};
    const prefix = 'gid://shopify/ProductVariant/';

    for (const node of nodes) {
      if (!node || !node.id) continue;

      const numericId = node.id.startsWith(prefix)
        ? node.id.slice(prefix.length)
        : node.id;

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
      setBannerStatus('warning');
      setBannerHeading('Cart is empty. Add items before fetching upsells');
      setBannerVisible(true);
      return;
    }

    const cartVariantIds = cart.lineItems
      .map(getVariantIdFromLineItem)
      .filter(Boolean);

    if (cartVariantIds.length === 0) {
      shopify.toast.show('No variant IDs found in cart');
      setBannerStatus('warning');
      setBannerHeading('No variant IDs found in cart');
      setBannerVisible(true);
      return;
    }

    setLoading(true);
    setBannerStatus('loading');
    setBannerHeading('Fetching upsell recommendations…');
    setBannerVisible(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({cartVariantIds}),
      });

      if (!res.ok) {
        setBannerStatus('error');
        setBannerHeading('Upsell fetch failed. Contact developer');
        setRecommendations([]);
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const baseRecs = data.recommendations || [];

      const recsWithImages = await hydrateRecommendationsWithImages(baseRecs);
      setRecommendations(recsWithImages);

      if (recsWithImages.length === 0) {
        setBannerStatus('empty');
        setBannerHeading('No upsell recommendations found for this cart');
      } else {
        setBannerStatus('success');
        setBannerHeading('Upsell recommendations found');
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      shopify.toast.show('Failed to fetch recommendations');
      if (bannerStatus !== 'error') {
        setBannerStatus('error');
        setBannerHeading('Upsell fetch failed. Contact developer');
      }
    } finally {
      setLoading(false);
    }
  };

  // ---- UI ----
  return (
    <s-page heading="POSAI smart upsell">
      {/* Banner stays fixed at top */}
      {bannerVisible && (
        <s-banner heading={bannerHeading} tone={mapStatusToTone(bannerStatus)}>
          <s-button slot="primary-action" onClick={() => setBannerVisible(false)}>
            Dismiss
          </s-button>
        </s-banner>
      )}

      {/* Only this area scrolls */}
      <s-scroll-box>
        <s-box padding="small">
          <s-section heading="Recommended products">
            {loading && <s-text>Loading recommendations…</s-text>}

            {!loading && recommendations.length > 0 && (
              <s-stack gap="base">
                {recommendations.map((rec) => {
                  const isAdded = addedVariantIds.includes(rec.variantId);

                  return (
                    <s-clickable
                      key={rec.variantId}
                      onClick={() => {
                        handleAddToCart(rec.variantId);
                      }}
                    >
                      <s-box padding="small">
                        <s-stack
                          direction="inline"
                          gap="base"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          {/* Left: image + product info */}
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
                              <s-text color="subdued">
                                {rec.variantTitle}
                              </s-text>

                              <s-text>${rec.price}</s-text>
                              <s-text color="subdued">
                                Inventory: {rec.inventoryQuantity}
                              </s-text>
                            </s-box>
                          </s-stack>

                          {/* Right: text + icon + badge */}
                          <s-stack
                            direction="inline"
                            gap="small"
                            alignItems="center"
                          >
                            <s-text color="subdued">Add to cart</s-text>
                            <s-icon type="cart" />
                            <s-badge tone={isAdded ? 'success' : 'neutral'}>
                              {isAdded ? 'Added' : 'Suggested'}
                            </s-badge>
                          </s-stack>
                        </s-stack>
                      </s-box>
                    </s-clickable>
                  );
                })}
                <s-divider direction="block" />
              </s-stack>
            )}
          </s-section>
        </s-box>
      </s-scroll-box>

      {/* Bottom actions: fixed, 50% width each */}
      <s-section>
        <s-box padding="small">
          <s-stack direction="block" alignItems="center" gap="small">
            <s-box inlineSize="50%">
              <s-button
                variant="primary"
                onClick={handleButtonClick}
                disabled={loading}
              >
                {loading ? 'Fetching…' : 'Show upsell'}
              </s-button>
            </s-box>

            <s-box inlineSize="50%">
              <s-button
                variant="secondary"
                onClick={handleAddAllToCart}
                disabled={loading || recommendations.length === 0}
              >
                Add all to cart
              </s-button>
            </s-box>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}
