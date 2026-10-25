import { useEffect } from "react";
import { Header } from "./components/header";
import { Intro } from "./components/intro";
import { About } from "./components/about";
import { Experience } from "./components/experience";
import { Projects } from "./components/projects";
import { Contact } from "./components/contact";
import { useRoute } from "./router";
import { pageMeta } from "./seo";

export default function App() {
    const { route } = useRoute();

    // Keep title and language in sync when a project is opened or closed without a page load.
    useEffect(() => {
        document.documentElement.lang = route.lang;
        document.title = pageMeta(route).title;
    }, [route]);

    return (
        <>
            <Header />
            <main>
                <Intro />
                <About />
                <Experience />
                <Projects />
            </main>
            <Contact />
        </>
    );
}
