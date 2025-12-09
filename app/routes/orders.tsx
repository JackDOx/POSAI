import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GET /api/orders - Returns all orders from the Shopify store
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate as admin
  const { admin } = await authenticate.admin(request);

  // Query all orders (first 50 for demo; use pagination for more)
  const response = await admin.graphql(`#graphql
    query GetOrdersWithProductIDs {
      orders(first: 50) {
        edges {
          node {
            id
            name
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  quantity
                  sku
                  variant {
                    id
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const json = await response.json();
  const orders = json.data?.orders?.edges?.map((edge: any) => edge.node) || [];

  return new Response(JSON.stringify({ orders }), {
    headers: { "Content-Type": "application/json" },
  });
};

export default function OrdersApiRoute() {
  return null; // API route, no UI
}
