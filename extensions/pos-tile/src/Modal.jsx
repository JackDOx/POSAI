import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe;
    console.log('shopify.cart:', shopify.cart.current);
    try {
      if (shopify.cart && shopify.cart.current && shopify.cart.current.subscribe) {
        unsubscribe = shopify.cart.current.subscribe((currentCart) => {
          setCart(currentCart);
        });
      } else {
        setError('Cart API not available');
      }
    } catch (e) {
      setError('Cart API not available');
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (error) return <div style={{color: 'red'}}>Error: {error}</div>;
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