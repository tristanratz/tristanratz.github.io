import { Fragment, ReactNode, RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import { IoArrowForward, IoClose, IoMail, IoSearch } from "react-icons/io5";
import { EmbeddingModel, loadEmbeddingModel } from "../../store/embeddings";
import { prefersReducedMotion } from "../../env";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { Doc, Match, normalizeWord, Result, search, semanticSearch } from "../../store/knowledge";
import { NetworkHandle } from "./NeuralNetwork";
import "./search.scss";

// Proof of concept: semantic search is only switched on via ?search=semantic.
function useEmbeddingModel() {
    const [model, setModel] = useState<EmbeddingModel | null>(null);
    const [status, setStatus] = useState<"off" | "loading" | "ready" | "error">("off");
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("search") !== "semantic") return;
        setStatus("loading");
        loadEmbeddingModel().then((m) => { setModel(m); setStatus("ready"); }, () => setStatus("error"));
    }, []);
    return { model, status };
}

/** Follows a result: opens the project, or scrolls to the place on the page and briefly highlights it. */
function follow(doc: Doc) {
    const { action } = doc;
    if (action.type === "project") {
        window.dispatchEvent(new CustomEvent("project:open", { detail: action.index }));
    } else if (action.type === "scroll") {
        window.dispatchEvent(new Event("search:navigate"));
        const target = document.getElementById(action.id);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.remove("searchHighlight");
        void target.offsetWidth; // restart the highlight animation
        target.classList.add("searchHighlight");
        window.setTimeout(() => target.classList.remove("searchHighlight"), 2200);
    }
}

function DocAction({ doc }: { doc: Doc }) {
    const ui = useUi();
    const { action } = doc;
    if (action.type === "link") {
        return <a className="docAction" href={action.href} onClick={() => window.dispatchEvent(new Event("search:navigate"))}><IoMail /> {action.label}</a>;
    }
    return (
        <button className="docAction" onClick={() => follow(doc)}>
            {action.type === "project" ? ui.search.openProject : action.label} <IoArrowForward />
        </button>
    );
}

// Cycles through example questions in the placeholder, typed out like a user would.
function useTypedPlaceholder(enabled: boolean, suggestions: string[]) {
    const [placeholder, setPlaceholder] = useState("");
    useEffect(() => {
        if (prefersReducedMotion()) return setPlaceholder(suggestions[0]);
        if (!enabled) return;
        let s = 0, c = 0, dir = 1, timer = 0;
        const step = () => {
            const text = suggestions[s];
            c += dir;
            setPlaceholder(text.slice(0, c));
            let delay = dir > 0 ? 55 : 22;
            if (dir > 0 && c >= text.length) { dir = -1; delay = 1800; }
            else if (dir < 0 && c <= 0) { dir = 1; s = (s + 1) % suggestions.length; delay = 350; }
            timer = window.setTimeout(step, delay);
        };
        timer = window.setTimeout(step, 400);
        return () => window.clearTimeout(timer);
    }, [enabled, suggestions]);
    return placeholder;
}

/** Marks the words of `text` that the query matched. */
function highlight(text: string, matches: Match[]): ReactNode {
    const words = new Set(matches.map((m) => m.word));
    if (!words.size) return text;
    return text.split(/([\p{L}\p{N}]+)/u).map((part, i) =>
        words.has(normalizeWord(part)) ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>);
}

/** Shows why a result came up: matched words, keyword score and (in semantic mode) similarity. */
function Explanation({ result }: { result: Result }) {
    const ui = useUi().search;
    const byWord = new Map(result.matches.map((m) => [m.word, m]));
    return (
        <details className="explain" onClick={(e) => e.stopPropagation()}>
            <summary>{ui.why}</summary>
            <ul>
                {byWord.size > 0 && (
                    <li>
                        {ui.matched}:{" "}
                        {[...byWord.values()].map((m, i) => (
                            <span key={m.word}>
                                {i > 0 && ", "}<b>{m.word}</b>
                                {m.synonymOf
                                    ? <> ({ui.synonymOf} {ui.quote(m.synonymOf)})</>
                                    : <>{m.word !== m.term && <> {ui.for} {ui.quote(m.term)}</>} ({ui.matchKinds[m.kind]})</>}
                            </span>
                        ))}
                    </li>
                )}
                <li>{ui.keywordScore}: {result.keyword ? result.keyword.toFixed(2) : ui.noKeywordMatch}</li>
                {result.semantic !== undefined && <li>{ui.semantic(result.semantic.toFixed(2))}</li>}
            </ul>
        </details>
    );
}

/** Keeps ?q= in the address bar in sync, so a search can be shared as a link. */
function useQueryParam(enabled: boolean, initial: string): [string, (q: string) => void] {
    const [query, setQuery] = useState(initial);
    const loaded = useRef(false);
    useEffect(() => {
        if (enabled && !initial) setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
        loaded.current = true;
    }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!enabled || !loaded.current) return;
        const timer = window.setTimeout(() => {
            const url = new URL(window.location.href);
            if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
            window.history.replaceState(window.history.state, "", url);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [query, enabled]);
    return [query, setQuery];
}

interface Props {
    /** Network that "computes" each answer with a forward pass. */
    network?: RefObject<NetworkHandle>;
    /** Starts the placeholder animation, so it doesn't compete with the slogan. */
    animate?: boolean;
    autoFocus?: boolean;
    /** Reads and writes the query as ?q= in the URL (only one search box on the page should). */
    syncUrl?: boolean;
    /** Query to start with (e.g. handed over from the hero). */
    initialQuery?: string;
    /**
     * Entry point only (the hero): shows no results itself, but hands what's typed over to the search
     * overlay, together with its position so the overlay can glide out of it.
     */
    entry?: boolean;
}

/** Opens the search overlay with a query; `from` is where the overlay should appear to come from. */
export const openSearch = (query: string, from?: DOMRect) =>
    window.dispatchEvent(new CustomEvent("search:open", { detail: { query, from } }));

export function SearchBox({ network, animate = false, autoFocus, syncUrl = false, initialQuery = "", entry = false }: Props) {
    const ui = useUi().search;
    const { lang } = useRoute().route;
    const id = useId();
    const answerRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useQueryParam(syncUrl, initialQuery);
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Handed-over text continues seamlessly: caret at the end.
    useEffect(() => {
        const input = inputRef.current;
        if (autoFocus && input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }, [autoFocus]);

    const handOver = (q: string) => {
        if (!q) return;
        openSearch(q, formRef.current?.getBoundingClientRect());
        inputRef.current?.blur();
    };
    const [active, setActive] = useState(-1);
    const placeholder = useTypedPlaceholder(animate, ui.suggestions);
    const { model, status } = useEmbeddingModel();
    const results = useMemo(() => (entry ? [] : model ? semanticSearch(query, model, lang) : search(query, lang)),
        [query, model, lang, entry]);
    const [top, ...related] = results;

    useEffect(() => setActive(-1), [results]);

    // Every new answer is "computed" by a forward pass that lands on the answer card.
    useEffect(() => {
        if (!top || !network) return;
        network.current?.forwardPass(() => {
            const r = answerRef.current?.getBoundingClientRect();
            return r ? { x: r.left + 28, y: r.top + 4 } : null;
        }, 2.4);
    }, [top?.doc, network]);

    const open = (result: Result) => {
        if (result.doc.action.type === "link") window.location.href = result.doc.action.href;
        else follow(result.doc);
    };

    // Arrow keys move through the results, Enter opens the active (or first) one.
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!results.length) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? results.length - 1 : a - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); open(results[Math.max(0, active)]); }
    };
    const optionId = (i: number) => `${id}-option-${i}`;

    return (
        <div className={"heroSearch" + (entry ? " entry" : "")}>
            <form role="search" className="searchBox" ref={formRef} onSubmit={(e) => { e.preventDefault(); if (entry) handOver(query); }}>
                <IoSearch />
                <input ref={inputRef} type="search" value={entry ? "" : query} placeholder={placeholder || ui.placeholder}
                       aria-label={ui.label} autoComplete="off" spellCheck={false}
                       role="combobox" aria-expanded={results.length > 0} aria-controls={`${id}-results`}
                       aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                       onKeyDown={onKeyDown} onChange={(e) => (entry ? handOver(e.target.value) : setQuery(e.target.value))} />
                {query && <button type="button" className="clear" aria-label={ui.clear} onClick={() => setQuery("")}><IoClose /></button>}
            </form>

            {!entry && status !== "off" && (
                <p className={"searchMode " + status}>
                    {ui.status[status]} · <a href="?">{ui.status.off}</a>
                </p>
            )}

            <div className="below">
            {/* Kept in place (just hidden) while typing, so the hero layout doesn't jump. */}
            <div className={"suggestions" + (query ? " hidden" : "")} aria-hidden={!!query}>
                {ui.suggestions.slice(0, 3).map((s) => (
                    <button key={s} tabIndex={query ? -1 : 0} onClick={() => (entry ? handOver(s) : setQuery(s))}>{s}</button>
                ))}
            </div>

            {!entry && <div className="results" id={`${id}-results`} role="listbox" aria-label={ui.results}>
                {query && !top && (
                    <p className="empty" role="status">
                        {ui.empty}
                        {status === "off" && <> <a href={`?search=semantic&q=${encodeURIComponent(query)}`}>{ui.trySemantic} →</a></>}
                    </p>
                )}
                {top?.fallback && <p className="closest">{ui.closest}</p>}
                {top && (
                    <div className={"answerCard" + (active === 0 ? " active" : "")} ref={answerRef} key={top.doc.kind + top.doc.title + top.doc.answer.length}
                         id={optionId(0)} role="option" aria-selected={active === 0}>
                        <span className="kind">{ui.kinds[top.doc.kind]}</span>
                        <h3>{highlight(top.doc.title, top.matches)}</h3>
                        <p>{highlight(top.snippet, top.matches)}</p>
                        <DocAction doc={top.doc} />
                        <Explanation result={top} />
                    </div>
                )}
                {related.length > 0 && (
                    <ul className="related">
                        {related.map((r, i) => (
                            <li key={r.doc.kind + r.doc.title + r.doc.answer.length} id={optionId(i + 1)} role="option"
                                aria-selected={active === i + 1} className={active === i + 1 ? "active" : undefined}>
                                <span className="kind">{ui.kinds[r.doc.kind]}</span>
                                {r.doc.action.type === "link"
                                    ? <a href={r.doc.action.href} tabIndex={-1}>{highlight(r.doc.title, r.matches)}</a>
                                    : <button onClick={() => follow(r.doc)} tabIndex={-1}>{highlight(r.doc.title, r.matches)}</button>}
                            </li>
                        ))}
                    </ul>
                                )}
            </div>}
            </div>
        </div>
    );
}
