import type { Lang } from "../router";

export interface Person {
    firstName: string;
    lastName: string;
    slogan: string;
    email: string;
    website: string;
    phone?: string;
    phoneHours?: string;
    instagram?: string;
    github?: string;
    linkedin?: string;
    xing?: string;
    medium?: string;
    city: string;
    locationHint?: string;
    state: string;
    country: string;
    favTec: string[];
    qualities: string[];
    interests: string[];
    /** Paragraphs; **…** marks what's highlighted on the page. */
    about: string[];
    job: string;
    employer: string;
    languages: {name: string, level: string}[];
    /** `when` is the year of the change (timeline marker), `period` the time spent there (shown on hover). */
    path: {when: string, period?: string, title: string, where: string, url: string, note?: string, education?: boolean}[];
}

export const person: Person = {
    firstName: "Tristan",
    lastName: "Ratz",
    slogan: "AI integration should only be a means to better UX",
    job: "Engineering Team Lead (AI, Search, Knowledge)",
    employer: "Serviceware",
    languages: [
        {name: "German", level: "native"},
        {name: "English", level: "C1"},
        {name: "French", level: "B1–B2"},
    ],
    email: "contact@tristanratz.com",
    website: "https://tristanratz.com",
    phone: "+49 (0) 6150/1833114",
    phoneHours: "mo–fr 8AM–8PM CET",
    instagram: "https://www.instagram.com/tristan.ratz/",
    github: "https://www.github.com/tristanratz",
    linkedin: "https://www.linkedin.com/in/ratz",
    medium: "https://medium.com/@tristanratz",
    city: "Darmstadt",
    locationHint: "near Frankfurt",
    state: "Hesse",
    country: "Germany",
    favTec: ["LLMs", "RAG", "Search", "Python", "PyTorch", "TypeScript", "React", "AWS", "GCP"],
    qualities: ["team player", "analytical", "curious", "fast learner"],
    interests: ["Large Language Models", "Retrieval Augmented Generation", "Search & Knowledge", "Human-centered AI"],
    about: [
        "At Serviceware, I manage the **teams around AI, search and knowledge** of the **AI-native Serviceware Platform**. We are working on the **future of AI-native Enterprise Service Management (ESM)** and, with **Agent Hub**, redefining the way people work in the service industry.",
        "Before that I worked as a **Generative AI consultant** at Genow AI and studied **Information Systems at TU Darmstadt**, where I spent most of my time on **natural language processing**, from question answering to retrieval augmented generation.",
        "What I keep coming back to: in a product, **AI is a means to an end, never an end in itself**. A model is only as good as **the experience it enables**. If people notice the AI more than the improvement, something went wrong.",
    ],
    path: [
        {when: "2026", period: "Since 2026", title: "Engineering Team Lead (AI, Search & Knowledge)", where: "Serviceware", url: "https://www.serviceware-se.com", note: "AI-native Enterprise Service Management with Agent Hub"},
        {when: "2024", period: "2024 – 2026", title: "AI Engineer", where: "Serviceware", url: "https://www.serviceware-se.com"},
        {when: "2024", title: "Generative AI Consultant", where: "Genow AI", url: "https://genow.ai"},
        {when: "2024", title: "M.Sc. Information Systems", where: "TU Darmstadt", url: "https://www.tu-darmstadt.de", note: "Thesis on reranker fine-tuning for RAG", education: true},
        {when: "2024", title: "Paper at NAACL", where: "Main Conference", url: "https://2024.naacl.org", note: "On the role of summary content units in summarization evaluation"},
        {when: "2022", title: "Data Analyst", where: "Bausicht", url: "https://www.bausicht.de"},
        {when: "2021", title: "CTO", where: "Yacht", url: "https://yacht-chat.com", note: "Virtual office for remote teams"},
    ],
};

// German version of the texts that differ; everything else is shared.
const german: Partial<Omit<Person, "path">> & { path: Partial<Person["path"][number]>[] } = {
    locationHint: "bei Frankfurt",
    state: "Hessen",
    country: "Deutschland",
    phoneHours: "Mo–Fr 8–20 Uhr MEZ",
    languages: [
        {name: "Deutsch", level: "Muttersprache"},
        {name: "Englisch", level: "C1"},
        {name: "Französisch", level: "B1–B2"},
    ],
    slogan: "KI-Integration sollte nur ein Mittel zu besserer UX sein",
    qualities: ["Teamplayer", "analytisch", "neugierig", "lernt schnell"],
    interests: ["Große Sprachmodelle", "Retrieval Augmented Generation", "Suche & Wissen", "Menschzentrierte KI"],
    about: [
        "Bei Serviceware verantworte ich die **Teams rund um KI, Suche und Wissen** der **KI-nativen Serviceware Platform**. Wir arbeiten an der **Zukunft des KI-nativen Enterprise Service Management (ESM)** und definieren mit **Agent Hub** neu, wie Menschen in der Service-Branche arbeiten.",
        "Davor war ich **Generative-AI-Consultant** bei Genow AI und habe **Wirtschaftsinformatik (Information Systems) an der TU Darmstadt** studiert, mit Schwerpunkt **Natural Language Processing**, von Question Answering bis Retrieval Augmented Generation.",
        "Worauf ich immer wieder zurückkomme: In Produkten ist **KI Mittel zum Zweck und kein Selbstzweck**. Ein Modell ist nur so gut wie **die Erfahrung, die es ermöglicht**. Wenn Menschen die KI mehr bemerken als die Verbesserung, ist etwas schiefgelaufen.",
    ],
    path: [
        {period: "Seit 2026", note: "KI-natives Enterprise Service Management mit Agent Hub"},
        {},
        {},
        {note: "Masterarbeit zum Fine-Tuning von Rerankern für RAG"},
        {title: "Paper auf der NAACL", note: "Zur Rolle von Summary Content Units bei der Bewertung von Zusammenfassungen"},
        {},
        {note: "Virtuelles Büro für verteilte Teams"},
    ],
};

/** The profile in the given language. */
export function getPerson(lang: Lang): Person {
    if (lang === "en") return person;
    const { path, ...rest } = german;
    return { ...person, ...rest, path: person.path.map((step, i) => ({ ...step, ...path[i] })) };
}

/** Anchor id of a timeline entry, used by the search to jump to it. */
export const experienceId = (index: number) => "experience-" + index;
