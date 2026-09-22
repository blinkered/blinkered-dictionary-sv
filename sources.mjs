/**
 * The collections that attest Swedish, and where each comes from.
 *
 * Swedish carries more evidence per speaker than anything else in this batch: 7,594 Internet
 * Archive texts and 255 Gutenberg books against a 371,287-word candidate list.
 *
 * Every URL here was probed before it was written down. A collection that 404s does not fail
 * loudly — the build skips it with a warning and reports a healthy number over fewer families.
 */
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  fileDocuments,
  fineweb2Documents,
  gutenbergBody,
  harvestDocuments,
  leipzigLocators,
  leipzigSentences,
  tatoebaDocuments,
  verseDocuments,
  wikiDocuments,
} from '@blinkered/attestation'

export const LANGUAGE = 'sv'

const CACHE = new URL('.cache/raw/', import.meta.url).pathname

/** A Leipzig package, with its sentence-to-URL index resolved up front. */
function leipzig(pkg) {
  const base = `${CACHE}${pkg}/${pkg}`
  const locators = leipzigLocators(
    readFileSync(`${base}-inv_so.txt`, 'utf8'),
    readFileSync(`${base}-sources.txt`, 'utf8'),
  )
  const lines = createInterface({
    input: createReadStream(`${base}-sentences.txt`),
    crlfDelay: Infinity,
  })
  return leipzigSentences(lines, locators)
}

// News only. The Leipzig Wikipedia packages are deliberately absent: they are Wikipedia text
// wearing a Leipzig label, so including one would corroborate `wiki:sv` while looking
// like another family. That is the exact failure the three-families rule exists to catch.
const LEIPZIG = [
  'swe_news_2023_1M',
  'swe_news_2022_1M',
]

const ALL = [
  {
    id: 'wiki:sv',
    what: 'Swedish Wikipedia — modern encyclopedic prose',
    needs: `${CACHE}svwiki.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}svwiki.xml.bz2`),
  },
  {
    id: 'wikisource:sv',
    what: 'Swedish Wikisource — same Wikimedia family, so it corroborates rather than counts',
    needs: `${CACHE}svwikisource.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}svwikisource.xml.bz2`),
  },
  ...LEIPZIG.map((pkg) => ({
    id: `lz:${pkg}`,
    from: `https://downloads.wortschatz-leipzig.de/corpora/${pkg}.tar.gz`,
    what: `Leipzig ${pkg} — modern news, cited by the page each sentence came from`,
    needs: `${CACHE}${pkg}`,
    documents: () => leipzig(pkg),
  })),
  {
    id: 'tat',
    from: 'https://downloads.tatoeba.org/exports/per_language/swe/swe_sentences.tsv.bz2',
    what: 'Tatoeba Swedish — contemporary and conversational',
    needs: `${CACHE}swe_sentences.tsv`,
    documents: () => tatoebaDocuments(`${CACHE}swe_sentences.tsv`),
  },
  {
    id: 'fw2',
    from: 'https://huggingface.co/datasets/HuggingFaceFW/fineweb-2/resolve/main/data/swe_Latn/train/000_00000.parquet',
    what: 'FineWeb-2 Swedish — a web crawl nobody here made',
    needs: `${CACHE}fineweb2-swe.parquet`,
    documents: () => fineweb2Documents(`${CACHE}fineweb2-swe.parquet`),
  },
  {
    id: 'gut',
    from: 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
    what: 'Project Gutenberg Swedish, 255 texts',
    needs: `${CACHE}gutenberg-sv`,
    documents: () => {
      const dir = `${CACHE}gutenberg-sv`
      const books = readdirSync(dir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => ({ locator: file.replace('.txt', ''), path: `${dir}/${file}` }))
      return fileDocuments(books, async (path) => gutenbergBody(readFileSync(path, 'utf8')))
    },
  },
  {
    id: 'ebible:swef',
    from: 'https://ebible.org/Scriptures/swef_vpl.zip',
    what: 'Svenska Folkbibeln — a family nothing else here belongs to',
    needs: `${CACHE}ebible-swef/swef_vpl.txt`,
    documents: () => verseDocuments(`${CACHE}ebible-swef/swef_vpl.txt`),
  },
  {
    id: 'ia',
    // Scanned books are OCR, and OCR fails in a way that looks like text. Clean Gutenberg scores
    // a median 52% known words and never below 36%; the worst of these scored 1%, an English
    // book read as Cyrillic. Below this floor a book is not legible enough to attest anything.
    legible: 0.35,
    what: 'Internet Archive Swedish books — literature, and the register a newspaper never reaches',
    needs: `${CACHE}archive-sv`,
    from: 'https://archive.org/search?query=mediatype%3Atexts+AND+language%3A%22Swedish%22',
    documents: () => {
      const dir = `${CACHE}archive-sv`
      // A locator names the text, not the item: the catalogue page holds no word of the book.
      const named = new Map(
        readFileSync(`${dir}/files.tsv`, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')),
      )
      const books = readdirSync(dir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => file.replace('.txt', ''))
        .filter((id) => named.has(id))
        // Percent-encoded: two thirds of Archive filenames contain spaces, and the evidence
        // format spends spaces as separators.
        .map((id) => ({
          locator: `${id}/${encodeURIComponent(named.get(id))}`,
          path: `${dir}/${id}.txt`,
        }))
      return fileDocuments(books, async (path) => readFileSync(path, 'utf8'))
    },
  },
]

export const SOURCES = ALL.filter((source) => {
  if (source.needs === undefined || existsSync(source.needs)) return true
  process.stderr.write(`  (skipping ${source.id}: ${source.needs} is not in .cache/raw)\n`)
  return false
})

/**
 * Swedish publishers, for the harvest.
 *
 * Chosen because they publish in Swedish rather than because they are large. A harvester
 * reads whatever it fetches and has no idea what language it is in, so a domain that publishes
 * mostly in another language would attest that language's words against these candidates. The
 * last group is literary and cultural, for a register the dailies never reach — which is where
 * the words one family short of the rule tend to live.
 */
export const DOMAINS = [
  'dn.se', 'svd.se', 'svt.se', 'sydsvenskan.se', 'gp.se',
  'aftonbladet.se', 'expressen.se', 'di.se', 'sr.se', 'omni.se',
  'runeberg.org', 'litteraturmagazinet.se', 'dixikon.se', 'tidningenkulturen.se',
]

export const HARVEST = existsSync(new URL('searched.tsv', import.meta.url).pathname)
  ? () => harvestDocuments(new URL('searched.tsv', import.meta.url).pathname)
  : undefined

/** Carried over from Blinkered's calibration; must be re-measured before anything ships. */
export const COMMON_CUT = 17000
