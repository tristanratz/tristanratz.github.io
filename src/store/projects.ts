import type { Lang } from "../router";
import projects from "../rsc/projects.json";

export interface ProjectData {
    slug: string;
    name: string;
    description: string;
    text: string[];
    technologies: string[];
    language: string;
    image: string;
    /** The image was generated with AI and is labelled as such. */
    aiImage?: boolean;
    date: string;
    github?: string;
    blogpost?: string;
    link?: string;
    /** Extra search terms (e.g. German), not displayed. */
    keywords?: string[];
}

type Raw = Omit<ProjectData, "technologies"> & { technologies: string[], de?: { description: string, text: string[] } };

/** All projects in the given language (German texts live in the "de" field of projects.json). */
export function getProjects(lang: Lang = "en"): ProjectData[] {
    return (projects as Raw[]).map(({ de, ...project }) => ({
        ...project,
        ...(lang === "de" && de ? de : {}),
        technologies: project.technologies.filter(Boolean),
    }));
}
