import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [cart, setCart] = useState(null);

useEffect(() => {
  if (!shopify.cart || !shopify.cart.current) {
    console.error('shopify.cart.current is not available');
    return;
  }
  const unsubscribe = shopify.cart.current.subscribe((currentCart) => {
    setCart(currentCart);
  });
  // shopify.toast.show('Subscribed to cart updates');
  return unsubscribe;
}, []);

  if (!cart) return <div>Loading cart...</div>;

  return (
    <s-page heading="POS modal">
      <s-scroll-box>
        <s-box padding="small">
          <s-text>Cart: {JSON.stringify(cart, null, 2)}</s-text>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}