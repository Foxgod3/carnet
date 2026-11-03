// « Dis-le en une phrase » : « débit 12,50 Carrefour », « crédit 200 salaire », « hier 8 € boulangerie »,
// « +35 remboursement Léa », « virement 50 de X vers Y ». La phrase remplit la saisie ; Gabin vérifie et valide.
// Partagé par le PC et le téléphone, sans aucun nom de banque : les comptes se reconnaissent à partir de leurs
// propres noms (identifiant, nom entier, initiales, mots distinctifs).

import { normaliser, nettoyerLibelle, versCentimes, dateLocale, estDate, JOUR_MS } from './logique.js';

// Mots qui ne disent que le sens : retirés de la description.
const SENS_DEPENSE = ['debit', 'debite', 'debitee', 'depense', 'paye', 'payee', 'paie', 'payer', 'achat', 'achete', 'achetee'];
const SENS_RENTREE = ['credit', 'credite', 'creditee', 'rentree', 'recu', 'recue', 'encaisse', 'encaissee'];
// Mots qui disent le sens mais décrivent aussi l'opération : gardés dans la description.
const CONTENU_DEPENSE = ['retrait', 'prelevement', 'preleve', 'paiement', 'loyer', 'facture'];
const CONTENU_RENTREE = ['salaire', 'remboursement', 'rembourse', 'depot', 'versement', 'prime', 'bourse', 'aide'];
const VIREMENT = ['virement', 'vire', 'transfert', 'transfere'];
// Mots de liaison retirés en début et en fin de description, jamais au milieu (« Pharmacie du Centre »).
const LIAISON = new Set([
  "j'ai", 'jai', 'j', 'ai', 'fait', 'fais', 'eu', 'un', 'une', 'de', 'd', 'du', 'des', 'le', 'la', 'les', 'l', 'chez', 'a', 'au', 'aux', 'sur',
  'avec', 'pour', 'par', 'en', 'et', 'ma', 'mon', 'mes', 'carte', 'cb', 'compte', 'vers', 'depuis', 'euro', 'euros', 'eur', 'ce', 'cet', 'cette',
  'matin', 'midi', 'soir', 'aprem', 'nuit', "aujourd'hui", 'aujourdhui', 'ete', "m'a", 'on',
]);
// Mots trop courants pour désigner un compte (des initiales comme « ce »), sauf écrits en capitales ou après
// « la », « compte », « carte ».
const MOTS_COURANTS = new Set(['ce', 'la', 'le', 'de', 'en', 'un', 'du', 'au', 'et', 'a', 'ou', 'sa', 'ma', 'ta', 'se', 'si', 'il', 'on', 'pas', 'sur']);
const MOTS_GENERIQUES = new Set(['banque', 'compte', 'comptes', 'courant', 'cheque', 'cheques', 'carte', 'principal', 'perso', 'personnel']);
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'et', 'a', 'au', 'aux', 'en']);

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mot = (m) => new RegExp(`(^|[^a-z])(${echapper(m)})(?=$|[^a-z])`, 'g');
const contient = (n, mots) => mots.some((m) => new RegExp(`(^|[^a-z])${echapper(m)}(?=$|[^a-z])`).test(n));

// Les façons de nommer un compte, tirées de son nom : « Banque du Nord » -> bn, banque du nord, nord.
export function aliasDuCompte(c) {
  const nom = normaliser(c.nom).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const mots = nom.split(/[\s']+/).filter(Boolean);
  const alias = new Set([normaliser(c.id), nom]);
  const initiales = mots.filter((m) => !PETITS.has(m)).map((m) => m[0]).join('');
  if (initiales.length >= 2) alias.add(initiales);
  for (const m of mots) if (m.length >= 4 && !MOTS_GENERIQUES.has(m)) alias.add(m);
  return [...alias].filter((a) => a.length >= 2);
}

// Où chaque compte est cité. `n` est la phrase normalisée, de même longueur que l'original.
function mentionsDeComptes(original, n, comptes) {
  const trouvees = [];
  for (const c of comptes) {
    for (const a of aliasDuCompte(c).sort((x, y) => y.length - x.length)) {
      for (const m of n.matchAll(new RegExp(`(^|[^a-z0-9])(${echapper(a)})(?=$|[^a-z0-9])`, 'g'))) {
        const debut = m.index + m[1].length;
        const fin = debut + a.length;
        if (MOTS_COURANTS.has(a)) {
          // Accepté écrit « CE », ou « Ce » / « Cé » en milieu de phrase (la dictée met une capitale aux noms),
          // ou après « la », « compte », « carte » ; jamais « ce matin ».
          const ecrit = original.slice(debut, fin);
          const majuscules = ecrit === ecrit.toUpperCase() && /[A-Z]/.test(ecrit);
          const capitale = /^[A-Z]/.test(ecrit) && debut > 0 && !/[.!?]\s*$/.test(original.slice(0, debut));
          if (!majuscules && !capitale && !/(^|\s)(la|compte|carte|ma|banque)\s+$/.test(n.slice(0, debut))) continue;
        }
        if (trouvees.some((t) => debut < t.fin && fin > t.debut)) continue;
        trouvees.push({ compte: c.id, debut, fin });
      }
    }
  }
  return trouvees.sort((a, b) => a.debut - b.debut);
}

// Le montant : celui suivi de « € » ou « euros » d'abord, sinon le premier nombre qui n'est ni une date ni une heure.
// La dictée écrit parfois « 12 euros 50 » ou « 12€50 » : les centimes après la devise comptent.
function trouverMontant(n) {
  const motif =
    /(^|[^\d/:,.])([+\-−]\s?)?(\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d/:])(\s?(?:€|eur\b|euros?\b)(?:\s?(\d{2})(?![\d/:,.]|\s?h\d))?)?/g;
  const candidats = [];
  for (const m of n.matchAll(motif)) {
    const debut = m.index + m[1].length;
    const fin = m.index + m[0].length;
    if (!m[4] && (/^\s?h\d/.test(n.slice(fin)) || /\dh$/.test(n.slice(0, debut)))) continue; // « 12h30 »
    const centimes = m[5] && !/[.,]/.test(m[3]) ? `,${m[5]}` : '';
    // Des centimes non retenus (le nombre en avait déjà) restent dans la phrase : on ne les retire pas.
    const finRetenue = m[5] && !centimes ? fin - m[5].length : fin;
    candidats.push({ debut, fin: finRetenue, brut: `${m[2] || ''}${m[3]}${centimes}`, devise: Boolean(m[4]), signe: (m[2] || '').trim() });
  }
  return candidats.find((c) => c.devise) || candidats[0] || null;
}

// Ce que la dictée écrit à sa façon : « C.E. » ou « C E » -> « CE ». Garde les autres caractères à leur place.
function preparerDictee(texte) {
  return texte
    .replace(/(^|[\s(])([A-Z])\.\s?([A-Z])\.?(?=$|[\s,;:!?)])/g, '$1$2$3')
    .replace(/(^|[\s(])([A-Z]) ([A-Z])(?=$|[\s,;:!?.)])/g, '$1$2$3');
}

function trouverDate(n, aujourdhui) {
  const base = Date.parse(`${aujourdhui}T12:00:00`);
  const decaler = (jours) => dateLocale(base - jours * JOUR_MS);
  const borne = (m, date) => ({ date, debut: m.index + m[1].length, fin: m.index + m[0].length });
  let m = /(^|\s)avant[\s-]hier(?=$|[\s,.])/.exec(n);
  if (m) return borne(m, decaler(2));
  m = /(^|\s)hier(?=$|[\s,.])/.exec(n);
  if (m) return borne(m, decaler(1));
  m = /(^|\s)(?:le\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=$|[\s,.])/.exec(n);
  if (m) {
    const annee = m[4] ? Number(m[4].length === 2 ? `20${m[4]}` : m[4]) : Number(aujourdhui.slice(0, 4));
    let date = `${annee}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (!m[4] && estDate(date) && date > aujourdhui) date = `${annee - 1}${date.slice(4)}`;
    if (estDate(date)) return borne(m, date);
  }
  return { date: aujourdhui, debut: -1, fin: -1 };
}

// -> { ok: true, sens: 'depense'|'rentree'|'virement', montant: '12,50', compte, vers, libelle, date, compteCite }
//    ou { ok: false, raison }
export function lirePhrase(texte, comptes, { compteParDefaut, aujourdhui = dateLocale() } = {}) {
  // Sans émoji (deux unités UTF-16) : chaque caractère garde la même place dans la phrase normalisée.
  const original = preparerDictee(
    String(texte ?? '')
      .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
  if (!original) return { ok: false, raison: 'Écris ou dicte une phrase, par exemple « débit 12,50 Carrefour ».' };
  const n = [...original].map((ch) => normaliser(ch)[0] ?? ch).join('');
  const montant = trouverMontant(n);
  if (!montant) return { ok: false, raison: 'Je ne trouve pas de montant dans la phrase.' };
  const centimes = versCentimes(montant.brut.replace(/\s/g, ''));
  if (!centimes) return { ok: false, raison: 'Montant illisible.' };

  const mentions = mentionsDeComptes(original, n, comptes);
  const distincts = [...new Set(mentions.map((m) => m.compte))];
  const date = trouverDate(n, aujourdhui);
  const avant = (m) => n.slice(Math.max(0, m.debut - 12), m.debut);
  const recoit = mentions.find((m) => /(^|\s)(vers|sur|a|au)\s+((la|le|ma|mon)\s+)?$/.test(avant(m)));
  const donne = mentions.find((m) => /(^|\s)(de|depuis|du)\s+((la|le|ma|mon)\s+)?$/.test(avant(m)) && m.compte !== recoit?.compte);
  const motVirement = contient(n, VIREMENT);

  let sens = 'depense';
  let compte = distincts[0] || compteParDefaut || comptes[0]?.id;
  let vers;
  if (distincts.length >= 2 && (motVirement || recoit || donne)) {
    // « de X vers Y », « vers Y depuis X », sinon le premier cité donne et le second reçoit.
    sens = 'virement';
    compte = donne?.compte || mentions.find((m) => m.compte !== recoit?.compte)?.compte;
    vers = recoit && recoit.compte !== compte ? recoit.compte : distincts.find((id) => id !== compte);
  } else if (distincts.length === 1 && motVirement && recoit && compteParDefaut && compteParDefaut !== recoit.compte) {
    // « virement de 50 vers Y » : depuis le compte choisi dans la saisie.
    sens = 'virement';
    compte = compteParDefaut;
    vers = recoit.compte;
  } else if (montant.signe === '+') sens = 'rentree';
  else if (montant.signe === '-' || montant.signe === '−') sens = 'depense';
  else if (/(^|\s)j'?ai rembourse(?=$|[^a-z])/.test(n)) sens = 'depense';
  else if (contient(n, SENS_RENTREE)) sens = 'rentree';
  else if (contient(n, [...SENS_DEPENSE, ...CONTENU_DEPENSE])) sens = 'depense';
  else if (contient(n, CONTENU_RENTREE)) sens = 'rentree';

  // La description : ce qui reste une fois retirés le montant, la date, les comptes cités et les mots de sens.
  const retirer = [montant, ...mentions];
  if (date.debut >= 0) retirer.push(date);
  for (const m of [...SENS_DEPENSE, ...SENS_RENTREE, ...(sens === 'virement' ? VIREMENT : [])]) {
    for (const r of n.matchAll(mot(m))) retirer.push({ debut: r.index + r[1].length, fin: r.index + r[1].length + m.length });
  }
  const garde = [...original];
  for (const r of retirer) for (let i = r.debut; i < r.fin; i += 1) garde[i] = '|';
  let mots = garde
    .join('')
    .split('|')
    .map((s) => s.replace(/[,;:!?()]+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  const liaison = (m) => LIAISON.has(normaliser(m).replace(/[.]+$/, '')) || /^[.\-–—]+$/.test(m);
  while (mots.length && liaison(mots[0])) mots.shift();
  while (mots.length && liaison(mots[mots.length - 1])) mots.pop();
  let libelle = nettoyerLibelle(mots.join(' ').replace(/^(d'|l')/i, '').replace(/[.]+$/, ''));
  if (libelle) libelle = libelle.charAt(0).toUpperCase() + libelle.slice(1);

  return {
    ok: true,
    sens,
    montant: (Math.abs(centimes) / 100).toFixed(2).replace('.', ','),
    compte,
    vers,
    libelle,
    date: date.date,
    compteCite: distincts.length > 0,
  };
}
