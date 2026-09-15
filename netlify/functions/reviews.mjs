import { json, parseBody } from "./_shared.mjs";
import { getStore } from "@netlify/blobs";

const REVIEWS_STORE_NAME = "miniature-works-reviews";

function reviewStore(context) {
  // Mirrors the store pattern used by orderStore() in _shared.mjs.
  // If _shared.mjs exports a generic store(name, context) helper, use that
  // instead of this to stay consistent with how orders.mjs does it.
  return getStore({ name: REVIEWS_STORE_NAME, context });
}

function cleanReview(raw) {
  return {
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    productName:
      typeof raw.productName === "string" ? raw.productName.trim() : "",
    rating: Number(raw.rating),
    text: typeof raw.text === "string" ? raw.text.trim() : "",
  };
}

function validateReview(review) {
  if (!review.name) return "Name is required.";

  if (
    review.productName !== "" &&
    typeof review.productName !== "string"
  ) {
    return "Product name must be a string.";
  }

  if (
    !Number.isFinite(review.rating) ||
    review.rating < 1 ||
    review.rating > 5
  ) {
    return "Rating must be a number between 1 and 5.";
  }

  if (!review.text) return "Review text is required.";

  return null;
}

function generateReviewId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function handlePost(req, context) {
  const review = cleanReview(await parseBody(req));
  const error = validateReview(review);

  if (error) return json({ error }, 400);

  const record = {
    ...review,
    createdAt: new Date().toISOString(),
  };

  const id = generateReviewId();

  try {
    const store = reviewStore(context);
    await store.setJSON(id, record);

    return json({ ok: true, id, review: record });
  } catch (err) {
    console.error("review_store_failed", err);
    return json(
      { error: "Review storage is temporarily unavailable." },
      503
    );
  }
}

async function handleGet(context) {
  try {
    const store = reviewStore(context);
    const { blobs } = await store.list();

    const reviews = await Promise.all(
      blobs.map(({ key }) => store.get(key, { type: "json" }))
    );

    const sorted = reviews
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );

    return json({ ok: true, reviews: sorted });
  } catch (err) {
    console.error("review_list_failed", err);
    return json(
      { error: "Reviews are temporarily unavailable." },
      503
    );
  }
}

async function handleDelete(req, context) {
  try {
    const body = await parseBody(req);
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return json({ error: "Review id is required." }, 400);
    }

    const store = reviewStore(context);
    const review = await store.get(id, { type: "json" });

    if (!review) {
      return json({ error: "Review not found." }, 404);
    }

    await store.delete(id);

    return json({ ok: true });
  } catch (err) {
    console.error("review_delete_failed", err);
    return json(
      { error: "Review deletion is temporarily unavailable." },
      503
    );
  }
}

export default async (req, context) => {
  if (req.method === "POST") return handlePost(req, context);
  if (req.method === "GET") return handleGet(context);
  if (req.method === "DELETE") return handleDelete(req, context);

  return json({ error: "Method not allowed." }, 405);
};