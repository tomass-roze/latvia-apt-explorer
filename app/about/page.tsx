import Link from 'next/link';
import { AboutActions } from './AboutActions';

export const metadata = {
  title: 'Par šo projektu · Latvijas dzīvokļu karte',
  description:
    'Metodoloģija, datu avoti, GDPR un kontaktinformācija Latvijas jauno dzīvokļu projektu kartei.',
};

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-dvh">
      <header className="h-14 px-6 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper)] shrink-0">
        <Link href="/" className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">
          ← Karte
        </Link>
        <h1 className="font-display text-xl tracking-tight">Par šo projektu</h1>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-10">
        <section>
          <h2 className="font-display text-2xl mb-3">Kas ir šī karte?</h2>
          <p className="text-[var(--ink-2)] leading-relaxed">
            Latvijas jauno dzīvokļu projektu apkopojums uz vienas kartes — ar
            filtriem, personalizētu vērtēšanu un piezīmēm. Mērķis: palīdzēt
            izvēlēties dzīvokli, nepārskatot tos pašus projektus atkal un atkal.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3">Datu avoti</h2>
          <ul className="space-y-2 text-[var(--ink-2)] leading-relaxed">
            <li>
              <strong>Projektu un dzīvokļu dati:</strong> ievākti ar
              skrāperiem tieši no izstrādātāju vietnēm (YIT u.c.). Atjaunoti katru
              nakti.
            </li>
            <li>
              <strong>Karte un flīzes:</strong>{' '}
              <a
                href="https://openfreemap.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                OpenFreeMap
              </a>{' '}
              ar OpenStreetMap datiem (
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                © OpenStreetMap contributors
              </a>
              ).
            </li>
            <li>
              <strong>Ģeokodēšana:</strong>{' '}
              <a
                href="https://nominatim.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Nominatim
              </a>{' '}
              (OpenStreetMap). Latvijas adrešu pārklājums uzlabosies, kad pievienosim{' '}
              <a
                href="https://developers.kartes.lv/en/geocoding/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Jāņa sēta
              </a>{' '}
              API atbalstu.
            </li>
            <li>
              <strong>Slāņi (skolas, transports, parki, veikali):</strong>{' '}
              vienreizēji izgūti no{' '}
              <a
                href="https://wiki.openstreetmap.org/wiki/Overpass_API"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Overpass API
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3">Vērtēšanas metodoloģija</h2>
          <p className="text-[var(--ink-2)] leading-relaxed mb-3">
            Vērtējums tiek aprēķināts klienta pusē, balstoties tikai uz objektīviem
            faktiem (cena, energoklase, attālums no centra utt.). Katram kritērijam
            ir slieksnis [0; 1] un personalizējams svars, kas summējas līdz 100%.
          </p>
          <p className="text-[var(--ink-2)] leading-relaxed">
            Projekta vērtējums = augstākais vērtējums starp tā dzīvokļiem, kas
            atbilst pašreizējiem filtriem. Rangs (#N no M) ir noderīgāks rādītājs
            par absolūto skaitli, jo neatkarīgi no svaru izvēles tas saglabā nozīmi.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3">Skrāpēšanas politika</h2>
          <p className="text-[var(--ink-2)] leading-relaxed mb-3">
            Pievērsīga skrāpēšana: 1 pieprasījums sekundē, identificējoša
            User-Agent virkne ar kontakta epastu, respektēts robots.txt. Tiesiskais
            pamats — likumīgu interešu īstenošana (GDPR Art. 6 (1)(f)) publiski
            pieejamu komercdarbības datu apkopošanai.
          </p>
          <p className="text-[var(--ink-2)] leading-relaxed">
            Izstrādātāji, kas vēlas izņemt savus datus no šīs vietnes, var sazināties
            ar mani —{' '}
            <a
              href="mailto:thomas@bubblebeeindustries.com?subject=Apartment%20Explorer%20-%20takedown"
              className="text-[var(--accent)] hover:underline"
            >
              thomas@bubblebeeindustries.com
            </a>{' '}
            — un projekta dati tiks noņemti 24 stundu laikā.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3">Tavi dati un GDPR</h2>
          <p className="text-[var(--ink-2)] leading-relaxed mb-3">
            Šī vietne neizmanto sīkdatnes un neveic izsekošanu. Visa personīgā
            informācija — statusi, piezīmes, saglabātie projekti, svaru iestatījumi —
            tiek glabāta vienīgi tava pārlūka lokālajā krātuvē (localStorage).
            Mēs neredzam šos datus.
          </p>
          <p className="text-[var(--ink-2)] leading-relaxed mb-4">
            Saskaņā ar GDPR Art. 15 un Art. 17 tev ir tiesības eksportēt vai dzēst
            šos datus jebkurā brīdī. Tā kā tie glabājas tikai tavā ierīcē, tu vari to
            izdarīt pats:
          </p>
          <AboutActions />
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3">Kontakti</h2>
          <p className="text-[var(--ink-2)] leading-relaxed">
            Jautājumi, kļūdas, ieteikumi —{' '}
            <a
              href="mailto:thomas@bubblebeeindustries.com"
              className="text-[var(--accent)] hover:underline"
            >
              thomas@bubblebeeindustries.com
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="px-6 py-3 border-t border-[var(--line)] text-xs text-[var(--ink-3)] shrink-0">
        © OpenStreetMap kartes dati · © OpenFreeMap flīzes · Nominatim ģeokodēšana
      </footer>
    </div>
  );
}
