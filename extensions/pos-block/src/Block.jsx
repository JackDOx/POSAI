import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

export function Extension() {
  return (
    <s-pos-block heading="Hello World">
      <s-button
        slot="secondary-actions"
        onClick={() => shopify.action.presentModal()}
      >
        Open action
      </s-button>
      <s-box padding="large">
        <s-text>This is a block extension</s-text>
      </s-box>
    </s-pos-block>
  );
}