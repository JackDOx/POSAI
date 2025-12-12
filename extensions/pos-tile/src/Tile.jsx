// ./extensions/pos-tile/src/Tile.jsx
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [hasItems, setHasItems] = useState(
    !!shopify.cart?.current?.value?.lineItems?.length
  );

  useEffect(() => {
    let unsubscribe;

    try {
      if (shopify.cart && shopify.cart.current && shopify.cart.current.subscribe) {
        unsubscribe = shopify.cart.current.subscribe((currentCart) => {
          const lineItems = currentCart?.lineItems ?? [];
          setHasItems(lineItems.length > 0);
        });
      }
    } catch (e) {
      console.error('Error subscribing to cart in tile:', e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleClick = () => {
    if (!hasItems) return; // extra safety
    shopify.action.presentModal();
  };

  return (
    <s-tile
      heading="POSAI"
      subheading="Upsell product recommender"
      tone="accent"
      disabled={!hasItems}
      onClick={handleClick}
    />
  );
}
