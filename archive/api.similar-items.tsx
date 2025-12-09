// import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
// import db from "../db.server";

// // POST endpoint: Receives a list of product IDs and returns similar items for each
// export const action = async ({ request }: ActionFunctionArgs) => {
//   const { productIds } = await request.json();
//   if (!Array.isArray(productIds)) {
//     return new Response(JSON.stringify({ error: "productIds must be an array" }), { status: 400 });
//   }

//   // Example: Fetch similar items for each product from item_similarity table
//   // This is a placeholder; update with your actual DB logic
//   const results = {};
//   for (const productId of productIds) {
//     // Replace with your actual Prisma/SQL query
//     const similar = await db.item_similarity.findMany({
//       where: { productId },
//       select: { similarItemId: true },
//     });
//     results[productId] = similar.map((row: any) => row.similarItemId);
//   }

//   return new Response(JSON.stringify({ results }), {
//     headers: { "Content-Type": "application/json" },
//   });
// };

// // Optionally, you can add a loader for GET requests if needed
// export const loader = async ({ request }: LoaderFunctionArgs) => {
//   return new Response(
//     JSON.stringify({ message: "Send a POST request with productIds to get similar items." }),
//     { headers: { "Content-Type": "application/json" } }
//   );
// };

// export default function SimilarItemsRoute() {
//   return null; // This is an API route, so no UI is rendered
// }
