import { getPerson } from "./person";
import { getProjects } from "./projects";

// Legal notice (Impressum) and privacy policy. German, as the site is operated from Germany;
// the English page shows a short note on top. Keep in sync with what the site actually does.
const address = ["Laserzentrum Groß-Gerau", "Am Sandböhl 2", "64521 Groß-Gerau", "Deutschland"];
const updated = "Oktober 2026";

export function ImprintText({ english }: { english: boolean }) {
    const person = getPerson("de");
    const name = `${person.firstName} ${person.lastName}`;
    const aiImages = getProjects("de").filter((p) => p.aiImage).map((p) => p.name);
    const mail = <a href={"mailto:" + person.email}>{person.email}</a>;
    const postal = address.map((line, i) => <span key={i}>{line}<br /></span>);
    return (
        <div>
            {english && (
                <p className="note" lang="en">
                    The legal notice and privacy policy are in German, as this site is run from Germany.
                    In short: no cookies, no tracking, no third-party content; the search runs in your browser.
                </p>
            )}

            <h2>Impressum</h2>
            <h3>Angaben gemäß § 5 DDG</h3>
            <p>{name}<br />{postal}</p>
            <h3>Kontakt</h3>
            <p>
                Telefon: {person.phone}<br />
                E-Mail: {mail}
            </p>
            <h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
            <p>{name}, Anschrift wie oben.</p>

            <h3>Haftung für Inhalte und Links</h3>
            <p>
                Die Inhalte dieser Seite sind mit Sorgfalt erstellt; für ihre Richtigkeit, Vollständigkeit und
                Aktualität kann ich jedoch keine Gewähr übernehmen. Für die Inhalte verlinkter Seiten sind
                ausschließlich deren Betreiber verantwortlich. Sobald mir Rechtsverletzungen bekannt werden,
                entferne ich die betreffenden Inhalte oder Links umgehend.
            </p>

            <h3>Urheberrecht und Bildnachweis</h3>
            <p>
                Texte, Fotos und Grafiken dieser Seite stammen von {name}, soweit nicht anders angegeben, und
                dürfen nicht ohne Zustimmung weiterverwendet werden.
            </p>
            <p>Mit KI generiert und auf der Seite als solche gekennzeichnet sind die Bilder zu folgenden Projekten:</p>
            <ul>{aiImages.map((project) => <li key={project}>{project}</li>)}</ul>
            <p>Außerdem verwendet:</p>
            <ul>
                <li>Icons: <a href="https://ionic.io/ionicons">Ionicons</a> (MIT-Lizenz)</li>
                <li>Schriften: Montserrat und Instrument Serif (SIL Open Font License), auf dieser Domain gehostet</li>
                <li>
                    Suchmodell: <a href="https://huggingface.co/minishlab/potion-multilingual-128M">potion-multilingual-128M</a> von
                    Minish Lab (MIT-Lizenz), verkleinert
                </li>
            </ul>

            <h2>Datenschutzerklärung</h2>
            <h3>Verantwortlicher</h3>
            <p>{name}<br />{postal}E-Mail: {mail}</p>

            <h3>Kurz gesagt</h3>
            <p>
                Diese Seite setzt keine Cookies, verwendet kein Tracking und keine Analysedienste und bindet
                keine Inhalte von Drittanbietern ein. Schriften, Bilder und das Suchmodell werden von dieser
                Domain geladen.
            </p>

            <h3>Hosting</h3>
            <p>
                Die Seite wird über GitHub Pages bereitgestellt, einen Dienst der GitHub Inc., 88 Colin P. Kelly Jr.
                Street, San Francisco, CA 94107, USA. Beim Aufruf verarbeitet GitHub die technisch notwendigen
                Daten, insbesondere IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse, Browser und
                Betriebssystem sowie die zuvor besuchte Seite, um die Seite auszuliefern und vor Missbrauch zu
                schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein berechtigtes Interesse liegt in einer
                sicheren und zuverlässigen Bereitstellung der Seite. Die Daten können in die USA übermittelt werden;
                GitHub ist nach dem EU-US Data Privacy Framework zertifiziert (Angemessenheitsbeschluss nach
                Art. 45 DSGVO). Wie lange GitHub die Daten speichert, legt GitHub fest; Einzelheiten stehen in
                der <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">Datenschutzerklärung von GitHub</a>.
            </p>

            <h3>Einstellungen in Ihrem Browser</h3>
            <p>
                Wenn Sie ein Farbschema oder die Kartenansicht der Projekte wählen, speichert die Seite diese
                Auswahl im lokalen Speicher Ihres Browsers (localStorage), damit sie beim nächsten Besuch erhalten
                bleibt. Diese Angaben verlassen Ihr Gerät nicht. Die Speicherung ist für die von Ihnen gewünschte
                Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Sie können sie jederzeit über die
                Einstellungen Ihres Browsers löschen.
            </p>

            <h3>Suche</h3>
            <p>
                Die Suche läuft vollständig in Ihrem Browser. Wenn Sie sie öffnen, wird dafür ein Sprachmodell
                von dieser Domain geladen; Ihre Suchanfragen werden nicht übertragen. Die Anfrage erscheint in der
                Adresszeile, damit Sie eine Suche als Link teilen können.
            </p>

            <h3>Kontakt</h3>
            <p>
                Die Flaschenpost öffnet lediglich Ihr eigenes E-Mail-Programm; über diese Seite wird nichts
                gesendet oder gespeichert. Wenn Sie mir schreiben oder anrufen, verarbeite ich Ihre Angaben, um
                Ihre Anfrage zu beantworten (Art. 6 Abs. 1 lit. b DSGVO, sonst lit. f). E-Mails an diese Adresse
                werden über iCloud Mail der Apple Distribution International Ltd., Hollyhill Industrial Estate,
                Hollyhill, Cork, Irland, empfangen und gespeichert. Ich lösche Ihre Nachricht, sobald sie
                erledigt ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
            </p>

            <h3>Links zu anderen Diensten</h3>
            <p>
                Die Symbole für LinkedIn, GitHub, Medium und Instagram sind einfache Links. Erst wenn Sie einen
                davon anklicken, werden Daten an den jeweiligen Anbieter übertragen; dort gelten dessen
                Datenschutzbestimmungen.
            </p>

            <h3>Ihre Rechte</h3>
            <p>Sie haben das Recht auf</p>
            <ul>
                <li>Auskunft über die zu Ihnen gespeicherten Daten (Art. 15 DSGVO),</li>
                <li>Berichtigung (Art. 16 DSGVO) und Löschung (Art. 17 DSGVO),</li>
                <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
                <li>Datenübertragbarkeit (Art. 20 DSGVO) und</li>
                <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO).</li>
            </ul>
            <p>
                Wenden Sie sich dafür einfach per E-Mail an mich. Außerdem können Sie sich bei einer
                Datenschutz-Aufsichtsbehörde beschweren, etwa beim <a href="https://datenschutz.hessen.de">Hessischen
                Beauftragten für Datenschutz und Informationsfreiheit</a>.
            </p>

            <h3>Verschlüsselung</h3>
            <p>Die Verbindung zu dieser Seite ist per TLS (https) verschlüsselt.</p>

            <p className="updated">Stand: {updated}</p>
        </div>
    );
}
