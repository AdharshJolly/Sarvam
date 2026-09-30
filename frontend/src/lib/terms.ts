import { TERMS, type TermName } from "@contracts/glossary";

/** Plain name for an internal noun, agreeing with the count ("1 key point", "3 key points"). */
export function term(name: TermName, count = 1): string {
  return count === 1 ? TERMS[name].singular : TERMS[name].plural;
}

/** "2 independent sources" */
export function counted(name: TermName, count: number): string {
  return `${count} ${term(name, count)}`;
}

/** Sentence-case version for headings and column titles ("Independent source"). */
export function termTitle(name: TermName, count = 1): string {
  const t = term(name, count);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function termHint(name: TermName): string {
  return TERMS[name].meaning;
}
