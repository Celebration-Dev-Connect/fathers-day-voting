import { Filter } from "bad-words";

const filter = new Filter();

/** Returns true if any of the provided strings contains a word from the blocklist. */
export function containsBadWords(texts: string[]): boolean {
  return texts.some((t) => filter.isProfane(t));
}
