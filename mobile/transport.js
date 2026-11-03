// Transport de l'appli mobile : il fournit window.comptes, la même interface que sur le PC, mais tout passe
// par le relais ntfy.sh, chiffré de bout en bout (AES-256-GCM). Le téléphone garde, chiffrées avec la clé
// du lien : la copie du dernier état envoyé par le PC et la boîte d'envoi des commandes pas encore confirmées.
// La clé du lien n'est stockée qu'enveloppée par le code de Gabin (PBKDF2) : sans le code, rien n'est lisible.

import * as L from '../noyau/logique.js';
import { ACTIONS, ACTIONS_MOBILE } from '../noyau/actions.js';
import { importerCle, chiffrer, dechiffrer, deballerCle, deplier, lireJumelage } from '../noyau/relais.js';
import { identifiant } from '../noyau/octets.js';

const SERVEUR = 'https://ntfy.sh';
const CLES = { jumelage: 'mc.jumelage', etat: 'mc.etat', dernier: 'mc.etat.id', boite: 'mc.boite' };
const CANAL_BOITE = 'boite';
const VERROU_MS = 5 * 60 * 1000;
const ATTENTE_REPONSE_MS = 8_000;
const CONTACT_MS = 5 * 60 * 1000;
const RELANCE_PC_MS = 4 * 60 * 1000;
const RENVOI_MS = 30_000;
const PEREMPTION_MS = 13 * 86_400_000; // le PC refuse une commande de plus de 14 jours
const ESSAIS = 5;
const PAUSE_MS = 30_000;

const lireLocal = (cle) => {
  try {
    return JSON.parse(localStorage.getItem(cle) || 'null');
  } catch {
    return null;
  }
};

let jumelage = lireLocal(CLES.jumelage);
let erreurJumelage = null;
let cle = null;
let base = null; // dernier état reçu du PC (déplié)
let boite = []; // commandes envoyées, pas encore confirmées par le PC
let annonces = [];
let source = null;
let cacheeDepuis = null;
let echecs = 0;
let bloqueJusqua = 0;
let attente = null; // synchronisation demandée au PC : { id, depuis }
let dernierContact = 0;
let minuteries = [];
const abonnes = [];

// Arrivée par le QR code : https://…/#j=… (le fragment n'est jamais envoyé au serveur). On le lit puis on l'efface.
try {
  const nouveau = lireJumelage(location.hash);
  if (nouveau) {
    for (const k of Object.values(CLES)) localStorage.removeItem(k);
    localStorage.setItem(CLES.jumelage, JSON.stringify(nouveau));
    jumelage = nouveau;
  }
} catch (e) {
  erreurJumelage = e.message;
}
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

// --- La vue, calculée avec la même logique que le PC -------------------------------------------

function copie() {
  return structuredClone({ comptes: base?.comptes || [], operations: base?.operations || [], recus: [] });
}

const recent = (a, b) => (a.date === b.date ? (b.creeLe || '').localeCompare(a.creeLe || '') : b.date.localeCompare(a.date));

function etatPc() {
  if (attente && Date.now() - attente.depuis < ATTENTE_REPONSE_MS) return 'attente';
  return Date.now() - dernierContact < CONTACT_MS ? 'connecte' : 'hors-ligne';
}

function construire() {
  const d = copie();
  const enEnvoi = new Set();
  // Les commandes pas encore confirmées sont appliquées à la copie : le résultat s'affiche tout de suite.
  for (const c of boite) {
    const avant = new Set(d.operations.map((o) => o.id));
    try {
      ACTIONS[c.n](d, c.a);
    } catch {
      // le PC tranchera
    }
    for (const o of d.operations) if (!avant.has(o.id)) enEnvoi.add(o.id);
    if (c.a?.id) enEnvoi.add(c.a.id);
  }
  for (const o of d.operations) if (enEnvoi.has(o.id)) o.envoi = true;
  const { comptes, total } = L.resume(d);
  return {
    plateforme: 'mobile',
    verrouille: false,
    chargement: !base,
    aujourdhui: L.dateLocale(),
    comptes,
    total,
    aVenir: d.operations.filter((o) => o.etat === 'a_venir').sort(recent),
    passees: d.operations.filter((o) => o.etat === 'passee').sort(recent),
    reglages: { banqueAuto: Boolean(base?.banque?.c) },
    statut: {
      pc: { etat: etatPc(), vu: base?.instant || null, envois: boite.length },
      banque: { derniere: base?.banque?.d || null, erreur: base?.banque?.e || null },
    },
    annonces,
  };
}

function vue() {
  if (!jumelage) return { plateforme: 'mobile', verrouille: true, existe: false, erreurJumelage };
  if (!cle) return { plateforme: 'mobile', verrouille: true, existe: true, attente: Math.max(0, bloqueJusqua - Date.now()) };
  return construire();
}

function prevenir() {
  const v = vue();
  for (const rappel of abonnes) rappel(v);
}

function annoncer(texte, erreur = false) {
  annonces = [...annonces, { id: identifiant(6), texte, erreur }].slice(-10);
}

// --- Relais ------------------------------------------------------------------------------------

async function sauverBoite() {
  if (!cle) return;
  localStorage.setItem(CLES.boite, await chiffrer(cle, boite, CANAL_BOITE));
}

async function envoyer(cmd) {
  try {
    const corps = await chiffrer(cle, cmd, jumelage.commandes);
    const reponse = await fetch(`${SERVEUR}/${jumelage.commandes}`, { method: 'POST', body: corps, cache: 'no-store' });
    if (!reponse.ok) throw new Error(String(reponse.status));
    cmd.envoye = Date.now();
  } catch {
    cmd.envoye = 0; // sans réseau : la commande attend dans la boîte et repartira
  }
}

function demanderAuPc() {
  if (!cle) return;
  attente = { id: identifiant(9), depuis: Date.now() };
  envoyer({ i: attente.id, n: 'synchroniser', t: Date.now() });
  setTimeout(prevenir, ATTENTE_REPONSE_MS + 200);
}

async function renvoyer() {
  if (!cle) return;
  const maintenant = Date.now();
  const perimees = boite.filter((c) => maintenant - c.t > PEREMPTION_MS);
  if (perimees.length) {
    boite = boite.filter((c) => !perimees.includes(c));
    annoncer(`${perimees.length} opération(s) notée(s) il y a plus de deux semaines n'ont jamais atteint le PC : abandonnée(s).`, true);
    await sauverBoite();
    prevenir();
  }
  for (const c of boite) if (!c.envoye || maintenant - c.envoye > 60_000) await envoyer(c);
}

async function traiterAccuses(recus) {
  let change = false;
  for (const [id, ok, erreur] of recus || []) {
    if (attente && id === attente.id) {
      attente = null;
      dernierContact = Date.now();
    }
    const cmd = boite.find((c) => c.i === id);
    if (!cmd) continue;
    boite = boite.filter((c) => c !== cmd);
    dernierContact = Date.now();
    change = true;
    if (!ok) annoncer(`Le PC a refusé : ${erreur || 'opération impossible'}`, true);
  }
  if (change) await sauverBoite();
}

async function recevoir(texte, idMessage) {
  let objet;
  try {
    objet = await dechiffrer(cle, texte, jumelage.etat);
  } catch {
    return; // pas pour nous, ou abîmé
  }
  if (objet?.fin === true) {
    delier('Le PC a délié ce téléphone : ses comptes y ont été effacés.');
    return;
  }
  const etat = deplier(objet);
  if (idMessage) localStorage.setItem(CLES.dernier, idMessage);
  if (!base || etat.instant > base.instant) {
    base = etat;
    localStorage.setItem(CLES.etat, texte);
  }
  await traiterAccuses(etat.recus);
  prevenir();
}

function fermerSource() {
  source?.close();
  source = null;
}

function ecouter() {
  fermerSource();
  if (!cle || document.hidden) return;
  const depuis = localStorage.getItem(CLES.dernier);
  const url = new URL(`${SERVEUR}/${jumelage.etat}/sse`);
  url.searchParams.set('since', depuis && /^[A-Za-z0-9]{1,32}$/.test(depuis) ? depuis : '12h');
  source = new EventSource(url);
  source.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === 'message' && typeof m.message === 'string') recevoir(m.message, m.id);
    } catch {
      // ligne illisible : ignorée
    }
  };
}

function demarrerTaches() {
  arreterTaches();
  minuteries = [setInterval(renvoyer, RENVOI_MS), setInterval(() => !document.hidden && demanderAuPc(), RELANCE_PC_MS)];
  ecouter();
  demanderAuPc();
  renvoyer();
}

function arreterTaches() {
  for (const m of minuteries) clearInterval(m);
  minuteries = [];
  fermerSource();
}

// --- Ouvrir, verrouiller, délier ------------------------------------------------------------------

async function ouvrir(code) {
  if (!jumelage) return { erreur: "Ce téléphone n'est pas relié." };
  const reste = bloqueJusqua - Date.now();
  if (reste > 0) return { erreur: `Trop d'essais : réessaie dans ${Math.ceil(reste / 1000)} s.` };
  try {
    const brute = await deballerCle(String(code || ''), jumelage.enveloppe);
    cle = await importerCle(brute);
    brute.fill(0);
  } catch {
    echecs += 1;
    if (echecs >= ESSAIS) {
      echecs = 0;
      bloqueJusqua = Date.now() + PAUSE_MS;
      return { erreur: "Code incorrect. Trop d'essais : attends 30 s." };
    }
    return { erreur: 'Code incorrect.' };
  }
  echecs = 0;
  const etat = localStorage.getItem(CLES.etat);
  if (etat) {
    try {
      base = deplier(await dechiffrer(cle, etat, jumelage.etat));
    } catch {
      base = null;
    }
  }
  const enAttente = localStorage.getItem(CLES.boite);
  if (enAttente) {
    try {
      boite = await dechiffrer(cle, enAttente, CANAL_BOITE);
    } catch {
      boite = [];
    }
  }
  demarrerTaches();
  return { vue: vue() };
}

function verrouiller() {
  arreterTaches();
  cle = null;
  base = null;
  boite = [];
  attente = null;
  prevenir();
}

function delier(raison = null) {
  arreterTaches();
  for (const k of Object.values(CLES)) localStorage.removeItem(k);
  jumelage = null;
  cle = null;
  base = null;
  boite = [];
  erreurJumelage = raison;
  prevenir();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cacheeDepuis = Date.now();
    fermerSource();
    return;
  }
  if (cle && cacheeDepuis && Date.now() - cacheeDepuis > VERROU_MS) verrouiller();
  else if (cle) {
    ecouter();
    demanderAuPc();
    renvoyer();
  }
  cacheeDepuis = null;
});
addEventListener('online', () => cle && renvoyer());

// --- Actions -------------------------------------------------------------------------------------

async function action(nom, args = {}) {
  if (!cle) return { erreur: 'Comptes verrouillés.' };
  if (nom === 'verrouiller') {
    verrouiller();
    return { vue: vue() };
  }
  if (nom === 'delier') {
    delier();
    return { vue: vue() };
  }
  if (nom === 'synchroniser') {
    ecouter();
    demanderAuPc();
    await renvoyer();
    return { vue: vue() };
  }
  if (!ACTIONS_MOBILE.has(nom)) return { erreur: 'Disponible sur le PC.' };
  const a = { ...args, origine: 'mobile' };
  if (nom === 'ajouter' || nom === 'virement') a.id = identifiant(9);
  if (nom === 'virement') a.id2 = identifiant(9);
  // Vérifiée tout de suite avec la même logique que le PC : une erreur s'affiche sans attendre le réseau.
  try {
    const essai = copie();
    for (const c of boite) {
      try {
        ACTIONS[c.n](essai, c.a);
      } catch {
        // déjà signalée
      }
    }
    ACTIONS[nom](essai, a);
  } catch (e) {
    return { erreur: e.message };
  }
  const cmd = { i: identifiant(9), n: nom, a, t: Date.now() };
  boite.push(cmd);
  await sauverBoite();
  envoyer(cmd).then(sauverBoite);
  return { vue: vue() };
}

window.comptes = {
  plateforme: 'mobile',
  vue: async () => vue(),
  creer: async () => ({ erreur: 'Les comptes se créent sur le PC.' }),
  ouvrir,
  action,
  surMaj: (rappel) => abonnes.push(rappel),
};

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
