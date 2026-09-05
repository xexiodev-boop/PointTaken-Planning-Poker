// index.html ships a static <link rel="canonical"> pointing at the homepage and
// is also served for /room/:id, which would mark every room a duplicate of it.
// Room URLs are join credentials, so the tag is removed there rather than
// corrected.
const ORIGIN = "https://pointtaken.team";
const INDEXABLE_PATHS = ["/", "/privacy"];

export function syncCanonicalTag() {
  const tag = document.querySelector('link[rel="canonical"]');
  if (!tag) return;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (INDEXABLE_PATHS.includes(path)) {
    tag.href = path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`;
  } else {
    tag.remove();
  }
}
