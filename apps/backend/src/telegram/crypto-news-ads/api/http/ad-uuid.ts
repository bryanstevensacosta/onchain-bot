/** UUID id param (ad or media) — reject anything else before it reaches
 *  the lookup so non-UUID ids return a clean 404 instead of a Postgres
 *  `invalid input syntax for type uuid` 500. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
