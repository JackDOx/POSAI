import {render} from 'preact';

export default function extension() {
  render(<SmartGridModal />, document.body);
}

function SmartGridModal() {
  const onButtonClick = (type, title, amount) => {
    shopify.cart.applyCartDiscount(type, title, amount);
    shopify.toast.show('Discount applied');
  };

  return (
    <s-tile
      heading="POS smart grid"
      subheading="preact Extension"
      onClick={() => shopify.action.presentModal()}
    />
  );
}
