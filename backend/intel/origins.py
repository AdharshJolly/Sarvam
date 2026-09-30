"""Origin clustering: how many independent origins stand behind the evidence (SSOT 9.6, FR-11).

Two sources are the same origin if any signal fires; clusters are merged with union-find.

- S1 (`domain`): same registrable domain, or same entry in the syndication-network list.
- S2 (`near_duplicate`): five-word shingle Jaccard of the claim passages >= 0.60.
- S3 (`shared_number`): same value for the same claim key and a shared distinctive six-word
  sequence.
- S4 (`attribution`): explicit attribution ("according to", "as per", "source:", "data from") of an
  entity: join a retrieved publisher it names, else an origin labelled with the entity.
- S0 (`none`): no signal. The source stays its own origin and independence is "unestablished".

Pure and deterministic: no database, no network, no LLM. `analyze.py` persists the result.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from backend.intel.keys import entities_match, id_number, norm_attribute, norm_period
from contracts.config import Thresholds
from contracts.models import OriginMethod

# Registrable domains are the last two labels except under these public multi-part suffixes.
MULTI_PART_SUFFIXES = frozenset(
    {
        "co.in", "org.in", "net.in", "gov.in", "nic.in", "ac.in", "res.in", "edu.in", "firm.in",
        "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au", "gov.au", "com.sg",
        "co.nz", "co.jp", "com.br", "co.za", "com.cn", "com.hk", "com.my", "co.id", "com.pk",
    }
)  # fmt: skip

# Small syndication-network list: outlets that share one publisher or wire desk (S1).
SYNDICATION_NETWORKS: dict[str, str] = {
    "hindustantimes.com": "ht-media",
    "livemint.com": "ht-media",
    "thehindu.com": "the-hindu-group",
    "thehindubusinessline.com": "the-hindu-group",
    "financialexpress.com": "indian-express-group",
    "indianexpress.com": "indian-express-group",
    "moneycontrol.com": "network18",
    "news18.com": "network18",
    "cnbctv18.com": "network18",
    "ndtv.com": "ndtv-group",
    "ndtvprofit.com": "ndtv-group",
}

# Priority of the method tag stored on a multi-member origin.
METHOD_PRIORITY = (
    OriginMethod.DOMAIN,
    OriginMethod.NEAR_DUPLICATE,
    OriginMethod.SHARED_NUMBER,
    OriginMethod.ATTRIBUTION,
)
_TYPE_RANK = {"regulator": 0, "company_primary": 1, "news": 2, "blog": 3, "unknown": 4}
_STOP = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it",
    "its", "of", "on", "or", "that", "the", "to", "was", "were", "will", "with",
}  # fmt: skip
_GENERIC_ENTITIES = {
    "company", "companies", "report", "reports", "sources", "source", "officials", "statement",
    "release", "press", "experts", "analysts", "media", "data", "survey", "study", "research",
}  # fmt: skip
_ENTITY = r"([A-Z][\w&'’.-]*(?:\s+(?:(?:of|for|and)\s+)?[A-Z][\w&'’.-]*){0,3})"
_ATTRIBUTION = [
    re.compile(r"\b(?i:according to)\s+(?:(?:the|a|an)\s+)?" + _ENTITY),
    re.compile(r"\b(?i:as per)\s+(?:(?:the|a|an)\s+)?" + _ENTITY),
    re.compile(r"\b(?i:source):\s*" + _ENTITY),
    re.compile(r"\b(?i:data from)\s+(?:(?:the|a|an)\s+)?" + _ENTITY),
]

# "according to India's EV policy" names a thing, not a publisher. A possessive entity only counts
# as an attribution when a word for a source document follows it ("VoltRide's own release").
_SOURCE_NOUNS = {
    "release", "report", "reports", "data", "figures", "statement", "filing", "filings", "study",
    "survey", "estimates", "estimate", "forecast", "forecasts", "website", "site", "page",
    "analysis", "research", "announcement", "numbers", "statistics", "database", "blog", "press",
    "own", "latest", "annual", "official", "newsroom", "notification", "circular", "order",
}  # fmt: skip


@dataclass(frozen=True)
class ClaimFact:
    """The parts of a claim that S3 needs."""

    entity: str | None
    attribute: str | None
    period: str | None
    value: float | None


@dataclass(frozen=True)
class OriginInput:
    source_id: str
    domain: str
    publisher: str | None
    source_type: str
    authority_tier: int
    claim_text: str  # text of the claim passages (all passages when the source has no claims)
    full_text: str  # all passages; scanned for attribution (S4)
    claims: tuple[ClaimFact, ...] = ()


@dataclass(frozen=True)
class OriginEdge:
    """A signal that fired between two nodes; `b` is `entity:<label>` for an S4 unretrieved one."""

    a: str
    b: str
    signal: OriginMethod


@dataclass
class OriginResult:
    label: str
    method: OriginMethod
    source_ids: list[str]
    entity: str | None = None  # set when an S4 unretrieved primary names this origin


@dataclass
class Clustering:
    origins: list[OriginResult] = field(default_factory=list)
    edges: list[OriginEdge] = field(default_factory=list)


# ---------------------------------------------------------------- text helpers


def registrable_domain(host: str) -> str:
    host = host.lower().strip().removeprefix("www.").split(":")[0].strip(".")
    labels = host.split(".")
    if len(labels) <= 2:
        return host
    if ".".join(labels[-2:]) in MULTI_PART_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def domain_label(host: str) -> str:
    """The brand label of a host: first label of its registrable domain, hyphens removed."""
    return registrable_domain(host).split(".")[0].replace("-", "")


def word_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def shingles(text: str, n: int) -> set[tuple[str, ...]]:
    words = word_tokens(text)
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def distinctive_grams(text: str, n: int) -> set[tuple[str, ...]]:
    """Word n-grams with at least n-2 content words: a shared one is a copied phrase, not filler."""
    words = word_tokens(text)
    out: set[tuple[str, ...]] = set()
    for i in range(len(words) - n + 1):
        gram = tuple(words[i : i + n])
        if sum(1 for w in gram if w not in _STOP) >= n - 2:
            out.add(gram)
    return out


def attributions(text: str) -> list[str]:
    """Entities a text explicitly attributes its information to (S4), in order, de-duplicated."""
    found: list[str] = []
    for pattern in _ATTRIBUTION:
        for m in pattern.finditer(text):
            raw = m.group(1).strip().rstrip(".,;:")
            possessive = re.search(r"['’]s\b", raw)
            if possessive:
                after = text[m.start(1) + possessive.end() : m.end() + 40].lower()
                if not _SOURCE_NOUNS & set(re.findall(r"[a-z]+", after)[:3]):
                    continue
                raw = raw[: possessive.start()]
            entity = raw
            words = entity.split()
            while words and words[-1].lower() in _GENERIC_ENTITIES:
                words.pop()  # "VoltRide Press" -> "VoltRide"
            entity = " ".join(words)
            if len(entity) < 3 or entity.lower() in _GENERIC_ENTITIES:
                continue
            if entity not in found:
                found.append(entity)
    return found


# ---------------------------------------------------------------- union-find


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def add(self, x: str) -> None:
        self.parent.setdefault(x, x)

    def find(self, x: str) -> str:
        self.add(x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def _same_value(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)


def _s3_key_match(a: OriginInput, b: OriginInput) -> bool:
    """Same numeric value for the same claim key (entity, attribute, period)."""
    for ca in a.claims:
        for cb in b.claims:
            attr = norm_attribute(ca.attribute)
            if (
                ca.value is not None
                and cb.value is not None
                and attr is not None
                and attr == norm_attribute(cb.attribute)
                and norm_period(ca.period) == norm_period(cb.period)
                and entities_match(ca.entity, cb.entity)
                and _same_value(ca.value, cb.value)
            ):
                return True
    return False


# ---------------------------------------------------------------- clustering


def cluster_origins(inputs: list[OriginInput], thresholds: Thresholds | None = None) -> Clustering:
    """Cluster sources into origins. Independence that no signal establishes stays unestablished."""
    t = thresholds or Thresholds()
    items = sorted(inputs, key=lambda i: id_number(i.source_id))
    uf = _UnionFind()
    edges: list[OriginEdge] = []
    for item in items:
        uf.add(item.source_id)

    def link(a: str, b: str, signal: OriginMethod) -> None:
        uf.union(a, b)
        edges.append(OriginEdge(a, b, signal))

    sh = {i.source_id: shingles(i.claim_text, t.shingle_words) for i in items}
    grams = {i.source_id: distinctive_grams(i.claim_text, t.shared_phrase_words) for i in items}

    for n, a in enumerate(items):
        net_a = SYNDICATION_NETWORKS.get(registrable_domain(a.domain))
        for b in items[n + 1 :]:
            reg_a, reg_b = registrable_domain(a.domain), registrable_domain(b.domain)
            net_b = SYNDICATION_NETWORKS.get(reg_b)
            if reg_a == reg_b or (net_a is not None and net_a == net_b):  # S1
                link(a.source_id, b.source_id, OriginMethod.DOMAIN)
            if jaccard(sh[a.source_id], sh[b.source_id]) >= t.near_duplicate_jaccard:  # S2
                link(a.source_id, b.source_id, OriginMethod.NEAR_DUPLICATE)
            if _s3_key_match(a, b) and grams[a.source_id] & grams[b.source_id]:  # S3
                link(a.source_id, b.source_id, OriginMethod.SHARED_NUMBER)

    # S4: a matching retrieved publisher, else a virtual origin labelled with the entity.
    labels = {i.source_id: domain_label(i.domain) for i in items}
    virtual_label: dict[str, str] = {}  # node id -> display label
    for item in items:
        for entity in attributions(item.full_text):
            joined = "".join(re.findall(r"[a-z0-9]+", entity.lower()))
            candidates = {joined, joined.removeprefix("the"), "the" + joined}
            target = next(
                (
                    other.source_id
                    for other in items
                    if other.source_id != item.source_id and labels[other.source_id] in candidates
                ),
                None,
            )
            if target is not None:
                link(item.source_id, target, OriginMethod.ATTRIBUTION)
                continue
            node = f"entity:{joined}"
            virtual_label.setdefault(node, entity)
            uf.add(node)
            link(item.source_id, node, OriginMethod.ATTRIBUTION)
            edges[-1] = OriginEdge(
                item.source_id, f"entity:{virtual_label[node]}", edges[-1].signal
            )

    by_root: dict[str, list[str]] = {}
    for node in list(uf.parent):
        by_root.setdefault(uf.find(node), []).append(node)
    by_id = {i.source_id: i for i in items}
    results: list[OriginResult] = []
    for members in by_root.values():
        sources = sorted((m for m in members if m in by_id), key=id_number)
        virtuals = sorted(m for m in members if m.startswith("entity:"))
        if not sources:
            continue  # an entity nobody in the run cites cannot exist
        inside = set(members)
        label_of = {f"entity:{virtual_label[v]}" for v in virtuals}
        signals = {
            e.signal
            for e in edges
            if (e.a in inside or e.a in label_of) and (e.b in inside or e.b in label_of)
        }
        method = next((m for m in METHOD_PRIORITY if m in signals), OriginMethod.NONE)
        if virtuals:
            entity = virtual_label[virtuals[0]]
            label = entity
        else:
            entity = None
            primary = min(
                (by_id[s] for s in sources),
                key=lambda i: (
                    i.authority_tier,
                    _TYPE_RANK.get(i.source_type, 4),
                    id_number(i.source_id),
                ),
            )
            label = primary.publisher or primary.domain
        results.append(OriginResult(label, method, sources, entity))
    results.sort(key=lambda r: id_number(r.source_ids[0]))
    return Clustering(results, _dedupe(edges))


def _dedupe(edges: list[OriginEdge]) -> list[OriginEdge]:
    seen: set[tuple[str, str, OriginMethod]] = set()
    out: list[OriginEdge] = []
    for e in edges:
        key = (e.a, e.b, e.signal)
        if key not in seen:
            seen.add(key)
            out.append(e)
    return out
