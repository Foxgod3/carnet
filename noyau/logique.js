// Le cœur des comptes, partagé par le PC et le téléphone : aucune dépendance à Node ni au navigateur,
// et aucun nom de banque (ce fichier est publié avec l'appli mobile).
// Les montants sont des centimes entiers (négatif = argent qui sort).

import { identifiant } from './octets.js';

export const JOUR_MS = 24 * 60 * 60 * 1000;
const LIBELLE_MAX = 80;
const MONTANT_MAX = 100_000_000_00; // 100 millions d'euros, en centimes

const ID_VALIDE = /^[A-Za-z0-9_-]{8,32}$/;

export function nouvelId() {
  return identifiant(9);
}

// Un identifiant choisi par le téléphone (pour que les deux côtés parlent de la même opération).
function idLibre(donnees, id) {
  if (id === undefined || id === null) return nouvelId();
  if (typeof id !== 'string' || !ID_VALIDE.test(id)) throw new Error('Identifiant invalide.');
  if (donnees.operations.some((o) => o.id === id)) throw new Error('Opération déjà enregistrée.');
  return id;
}

export function dateLocale(instant = Date.now()) {
  const d = new Date(instant);
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

export function estDate(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const d = new Date(`${texte}T12:00:00`);
  return !Number.isNaN(d.getTime()) && dateLocale(d) === texte;
}

export function ecartJours(a, b) {
  return Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / JOUR_MS);
}

export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase();
}

export function nettoyerLibelle(texte) {
  const propre = String(texte ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return propre.slice(0, LIBELLE_MAX);
}

// « CARREFOUR CITY BORDEAUX » -> « Carrefour City Bordeaux » (les banques écrivent tout en capitales).
// Les petits mots restent en minuscules, sauf en tête : « Pharmacie du Centre », « Boulangerie de la Gare ».
const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en', 'sur', 'sous', 'pour', 'par']);

export function adoucirMajuscules(texte) {
  const t = nettoyerLibelle(texte);
  if (!/[A-Z]{3}/.test(t) || /[a-z]/.test(t)) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((mot, i) => (i > 0 && PETITS_MOTS.has(mot) ? mot : mot.replace(/(^|[\-'’/("])(\p{L})/gu, (_, avant, lettre) => avant + lettre.toUpperCase())))
    .join(' ');
}

// « 1 234,56 », « 1.234,56 », « 12.5 », « -12,50 », « 1,234.56 » -> centimes (toujours positif ou négatif selon le signe écrit)
export function versCentimes(texte) {
  if (typeof texte === 'number') {
    return Number.isFinite(texte) ? Math.round(texte * 100) : null;
  }
  let s = String(texte ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/[€]|eur(os?)?$/i, '')
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[−–]/g, '-');
  if (!s) return null;
  let signe = 1;
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('-')) {
    signe = -1;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    signe = -1;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const virgule = s.lastIndexOf(',');
  const point = s.lastIndexOf('.');
  let entier = s;
  let decimales = '';
  const sep = Math.max(virgule, point);
  if (sep >= 0) {
    const apres = s.slice(sep + 1);
    const lesDeux = virgule >= 0 && point >= 0;
    // « 1.234 » = mille deux cent trente-quatre ; « 12.5 » ou « 12,50 » = des décimales.
    const milliers = !lesDeux && apres.length === 3 && s.slice(0, sep).replace(/[.,]/g, '') !== '0';
    if (!milliers) {
      if (apres.length > 2) return null;
      entier = s.slice(0, sep);
      decimales = apres;
    }
  }
  entier = entier.replace(/[.,]/g, '');
  if (!/^\d+$/.test(entier || '0') || (decimales && !/^\d{1,2}$/.test(decimales))) return null;
  const centimes = Number(entier || '0') * 100 + Number((decimales + '00').slice(0, 2));
  if (!Number.isSafeInteger(centimes) || centimes > MONTANT_MAX) return null;
  return signe * centimes;
}

export function montantValide(montant) {
  return Number.isSafeInteger(montant) && montant !== 0 && Math.abs(montant) <= MONTANT_MAX;
}

export function compte(donnees, id) {
  const c = donnees.comptes.find((x) => x.id === id);
  if (!c) throw new Error('Compte inconnu.');
  return c;
}

export function resume(donnees) {
  const comptes = donnees.comptes.map((c) => {
    const aVenir = donnees.operations.filter((o) => o.compte === c.id && o.etat === 'a_venir');
    const totalAVenir = aVenir.reduce((s, o) => s + o.montant, 0);
    return {
      id: c.id,
      nom: c.nom,
      couleur: c.couleur,
      source: c.source,
      dansTotal: c.dansTotal,
      soldeBanque: c.soldeBanque,
      soldeDate: c.soldeDate,
      aVenir: totalAVenir,
      nbAVenir: aVenir.length,
      disponible: c.soldeBanque === null ? null : c.soldeBanque + totalAVenir,
    };
  });
  const comptes_total = comptes.filter((c) => c.dansTotal);
  return {
    comptes,
    total: {
      disponible: comptes_total.reduce((s, c) => s + (c.disponible ?? c.aVenir), 0),
      banque: comptes_total.reduce((s, c) => s + (c.soldeBanque ?? 0), 0),
      aVenir: comptes_total.reduce((s, c) => s + c.aVenir, 0),
      incomplet: comptes_total.some((c) => c.soldeBanque === null),
    },
  };
}

export function ajouterOperation(donnees, { id, compte: compteId, montant, libelle, date, origine = 'manuel', ref = null, etat = 'a_venir' }) {
  compte(donnees, compteId);
  if (!montantValide(montant)) throw new Error('Montant invalide.');
  const jour = date || dateLocale();
  if (!estDate(jour)) throw new Error('Date invalide.');
  const op = {
    id: idLibre(donnees, id),
    compte: compteId,
    montant,
    libelle: nettoyerLibelle(libelle) || (montant < 0 ? 'Dépense' : 'Rentrée'),
    date: jour,
    etat,
    origine,
    ref,
    lien: null,
    creeLe: new Date().toISOString(),
  };
  donnees.operations.push(op);
  return op;
}

export function virement(donnees, { id, id2, de, vers, montant, libelle, date, origine = 'manuel' }) {
  if (de === vers) throw new Error('Choisis deux comptes différents.');
  const somme = Math.abs(montant);
  const texte = nettoyerLibelle(libelle);
  const sortie = ajouterOperation(donnees, {
    id,
    compte: de,
    montant: -somme,
    libelle: texte || `Virement vers ${compte(donnees, vers).nom}`,
    date,
    origine,
  });
  const entree = ajouterOperation(donnees, {
    id: id2,
    compte: vers,
    montant: somme,
    libelle: texte || `Virement depuis ${compte(donnees, de).nom}`,
    date,
    origine,
  });
  sortie.lien = entree.id;
  entree.lien = sortie.id;
  return [sortie, entree];
}

function trouverOperation(donnees, id) {
  const op = donnees.operations.find((o) => o.id === id);
  if (!op) throw new Error('Opération introuvable.');
  return op;
}

// « C'est passé à la banque » : l'opération quitte « à venir » et entre dans le solde de la banque,
// donc le disponible ne bouge pas. Pour un compte synchronisé, le solde vient de la banque : on ne le touche pas.
export function marquerPassee(donnees, id) {
  const op = trouverOperation(donnees, id);
  if (op.etat !== 'a_venir') return op;
  const c = compte(donnees, op.compte);
  op.etat = 'passee';
  op.passeeLe = new Date().toISOString();
  if (c.source === 'manuel' && c.soldeBanque !== null) c.soldeBanque += op.montant;
  return op;
}

export function supprimer(donnees, id) {
  const op = trouverOperation(donnees, id);
  const ids = new Set([op.id]);
  if (op.lien) ids.add(op.lien);
  donnees.operations = donnees.operations.filter((o) => !ids.has(o.id));
  return [...ids];
}

export function modifier(donnees, id, { libelle, montant, date, compte: compteId }) {
  const op = trouverOperation(donnees, id);
  if (libelle !== undefined) op.libelle = nettoyerLibelle(libelle) || op.libelle;
  if (montant !== undefined) {
    if (!montantValide(montant)) throw new Error('Montant invalide.');
    if (op.ref) throw new Error('Le montant vient de la banque : il ne se modifie pas.');
    op.montant = montant;
  }
  if (date !== undefined) {
    if (!estDate(date)) throw new Error('Date invalide.');
    op.date = date;
  }
  if (compteId !== undefined && compteId !== op.compte) {
    compte(donnees, compteId);
    if (op.ref) throw new Error('Cette opération vient de la banque : elle reste sur son compte.');
    op.compte = compteId;
  }
  return op;
}

// Le solde que montre l'appli de la banque ; idsDejaPasses = les « à venir » déjà comptés dedans.
export function nouveauSolde(donnees, compteId, montant, idsDejaPasses = []) {
  const c = compte(donnees, compteId);
  if (!Number.isSafeInteger(montant) || Math.abs(montant) > MONTANT_MAX) throw new Error('Solde invalide.');
  c.soldeBanque = montant;
  c.soldeDate = new Date().toISOString();
  const ids = new Set(idsDejaPasses);
  for (const op of donnees.operations) {
    if (op.compte === compteId && op.etat === 'a_venir' && ids.has(op.id)) {
      op.etat = 'passee';
      op.passeeLe = c.soldeDate;
    }
  }
  return c;
}
