// Chiffrement de bout en bout entre le PC et le téléphone, et format compact de l'état partagé.
// Même fichier des deux côtés : WebCrypto (AES-256-GCM, PBKDF2-SHA256) et CompressionStream existent
// dans Node 20+ comme dans Chrome. Le relais (ntfy.sh) ne voit que « mc1.<base64url> ».

import { aleatoire, versBase64url, depuisBase64url, texteVersOctets, octetsVersTexte } from './octets.js';

const PREFIXE = 'mc1.';
const IV = 12;
const ITERATIONS = 310_000; // recommandation OWASP 2023 pour PBKDF2-SHA256
const subtle = () => globalThis.crypto.subtle;

async function transformer(octets, flux) {
  const sortie = new Blob([octets]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

export const compresser = (octets) => transformer(octets, new CompressionStream('deflate-raw'));
export const decompresser = (octets) => transformer(octets, new DecompressionStream('deflate-raw'));

export function importerCle(octets) {
  if (!(octets instanceof Uint8Array) || octets.length !== 32) throw new Error('Clé invalide.');
  return subtle().importKey('raw', octets, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export const nouvelleCle = () => aleatoire(32);

// « contexte » (le nom du canal) est authentifié : un message copié d'un canal à l'autre est refusé.
export async function chiffrer(cle, objet, contexte) {
  const iv = aleatoire(IV);
  const clair = await compresser(texteVersOctets(JSON.stringify(objet)));
  const chiffre = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: texteVersOctets(contexte) }, cle, clair)
  );
  const tout = new Uint8Array(IV + chiffre.length);
  tout.set(iv);
  tout.set(chiffre, IV);
  return PREFIXE + versBase64url(tout);
}

export async function dechiffrer(cle, texte, contexte) {
  if (typeof texte !== 'string' || !texte.startsWith(PREFIXE)) throw new Error('Message non chiffré.');
  const tout = depuisBase64url(texte.slice(PREFIXE.length));
  if (tout.length <= IV + 16) throw new Error('Message trop court.');
  const clair = await subtle().decrypt(
    { name: 'AES-GCM', iv: tout.subarray(0, IV), additionalData: texteVersOctets(contexte) },
    cle,
    tout.subarray(IV)
  );
  return JSON.parse(octetsVersTexte(await decompresser(new Uint8Array(clair))));
}

export const estChiffre = (texte) => typeof texte === 'string' && texte.startsWith(PREFIXE);

async function cleDeCode(code, sel, iterations) {
  const base = await subtle().importKey('raw', texteVersOctets(String(code).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// La clé du lien est enveloppée par le code de Gabin : le QR code seul ne permet rien.
export async function envelopperCle(code, cleBrute, iterations = ITERATIONS) {
  const sel = aleatoire(16);
  const iv = aleatoire(IV);
  const enveloppe = await cleDeCode(code, sel, iterations);
  const chiffre = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, enveloppe, cleBrute));
  const tout = new Uint8Array(IV + chiffre.length);
  tout.set(iv);
  tout.set(chiffre, IV);
  return { s: versBase64url(sel), i: iterations, k: versBase64url(tout) };
}

export async function deballerCle(code, { s, i, k }) {
  if (!Number.isSafeInteger(i) || i < 100_000 || i > 10_000_000) throw new Error('Lien invalide.');
  const tout = depuisBase64url(k);
  const enveloppe = await cleDeCode(code, depuisBase64url(s), i);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: tout.subarray(0, IV) }, enveloppe, tout.subarray(IV)));
  } catch {
    throw new Error('Code incorrect.');
  }
}

// --- Lien de jumelage : https://…/#j=<base64url(JSON)> ; le fragment n'est jamais envoyé au serveur ----

const SUJET = /^mc-[A-Za-z0-9_-]{20,60}$/;

export function lienDeJumelage(base, { etat, commandes, enveloppe }) {
  const charge = versBase64url(texteVersOctets(JSON.stringify({ v: 1, e: etat, c: commandes, ...enveloppe })));
  return `${base.replace(/#.*$/, '')}#j=${charge}`;
}

export function lireJumelage(fragment) {
  const m = /^#?j=([A-Za-z0-9_-]+)$/.exec(fragment || '');
  if (!m) return null;
  const j = JSON.parse(octetsVersTexte(depuisBase64url(m[1])));
  if (j.v !== 1 || !SUJET.test(j.e) || !SUJET.test(j.c) || typeof j.s !== 'string' || typeof j.k !== 'string') {
    throw new Error('Lien de jumelage invalide.');
  }
  return { etat: j.e, commandes: j.c, enveloppe: { s: j.s, i: j.i, k: j.k } };
}

// --- État compact envoyé au téléphone (un message ntfy doit rester sous 4 Ko) -----------------------

const ORIGINES = ['manuel', 'telephone', 'banque', 'import', 'mobile'];
const SOURCES = ['manuel', 'auto'];
const JOUR = 86_400_000;

const jourVersEcart = (aujourdhui, date) => Math.round((Date.parse(`${aujourdhui}T12:00:00`) - Date.parse(`${date}T12:00:00`)) / JOUR);
function ecartVersJour(aujourdhui, ecart) {
  const d = new Date(Date.parse(`${aujourdhui}T12:00:00`) - ecart * JOUR);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// options : { passees, libelleMax } ; renvoie un objet JSON compact.
export function compacter(etat, { passees = 40, libelleMax = 60 } = {}) {
  const index = new Map(etat.comptes.map((c, i) => [c.id, i]));
  const op = (o) => [
    o.id,
    index.get(o.compte),
    o.montant,
    o.libelle.slice(0, libelleMax),
    jourVersEcart(etat.aujourdhui, o.date),
    o.etat === 'a_venir' ? 0 : 1,
    Math.max(0, ORIGINES.indexOf(o.origine)),
    o.ref ? 1 : 0,
    ...(o.lien ? [o.lien] : []),
  ];
  return {
    v: 1,
    t: etat.instant,
    a: etat.aujourdhui,
    c: etat.comptes.map((c) => [c.id, c.nom, c.couleur, SOURCES.indexOf(c.source), c.dansTotal ? 1 : 0, c.soldeBanque, c.soldeDate ? Date.parse(c.soldeDate) : null, c.aVenir, c.nbAVenir]),
    o: [...etat.aVenir.map(op), ...etat.passees.slice(0, passees).map(op)],
    q: etat.banque,
    r: etat.recus,
  };
}

export function deplier(compact) {
  if (compact?.v !== 1 || !Array.isArray(compact.c) || !Array.isArray(compact.o)) throw new Error('État illisible.');
  const comptes = compact.c.map(([id, nom, couleur, source, dansTotal, soldeBanque, soldeDate, aVenir, nbAVenir]) => ({
    id,
    nom,
    couleur,
    source: SOURCES[source] || 'manuel',
    dansTotal: Boolean(dansTotal),
    soldeBanque,
    soldeDate: soldeDate ? new Date(soldeDate).toISOString() : null,
    aVenir,
    nbAVenir,
  }));
  const operations = compact.o.map(([id, i, montant, libelle, ecart, passee, origine, ref, lien]) => ({
    id,
    compte: comptes[i]?.id,
    montant,
    libelle,
    date: ecartVersJour(compact.a, ecart),
    etat: passee ? 'passee' : 'a_venir',
    origine: ORIGINES[origine] || 'manuel',
    lien: lien || null,
    ref: ref ? 'banque' : null,
  }));
  return { instant: compact.t, aujourdhui: compact.a, comptes, operations, banque: compact.q || null, recus: compact.r || [] };
}
